//const UTILS = require('../../config.js').UTILS;
const ClientPool = require('./ClientPool');
const randomStr = require('./random-string.js');
const WebSocket = require('ws');
const {parse} = require('url');
let sidHeader = 'sid';

module.exports = class Room {
  constructor(ops = {}){
    this._sidHeader = ops.sidHeader;
    this._clients = new Map();
    this._id = randomStr();
    this._name = ops.name || this._id;
    this._initTimeout = ops.initTimeout || 10000;
    this._reconnectTimeout = ops.reconnectTimeout || 0;
  }

  get id(){
    return this._id;
  }

  /**@api Provide a name via the constructor 'name' option to provide more reader
      friendly logging*/
  get name(){

  }

  hasClient(inputClient){
    const sid = typeof inputClient === 'string' ? inputClient : inputClient.sid;
    return Boolean(this._clients.get(sid));
  }

  isConnected(client){
    const clientInfo = this._clients.get(client.sid);
    return clientInfo && !clientInfo.disconnected && !clientInfo.rejoinRequired;
  }

  getClientBySid(sid){
    const clientInfo = this._clients.get(sid);
    return clientInfo && clientInfo.client;
  }

  //userInfo must contain at least an id property
  join(userInfo){
    let sid = null;

    if(userInfo.sid){
      sid = userInfo.sid;
    } else if (userInfo.cookie){
      sid = getCookie(userInfo.cookie, sidHeader);
    } else {
      console.log('Room error: sid not provided in join()');
      return {success: false, reason: 'Server error'};
    }

    const clientInfo = this._clients.get(sid);
    if(clientInfo && (clientInfo.disconnected || clientInfo.rejoinRequired)){
      if(userInfo.id === clientInfo.client.id){
        clientInfo.rejoinRequired = true;
        this._onClientRejoin(clientInfo);
        return {success: true, id: this.id};
      } else {
        //Then the client is using the same session under a different ID. Leave with the other ID and carry on the join process as normal.
        clientInfo.disconnected = false;
        this.leave(clientInfo.client);
      }
    } else if (clientInfo){
      return {success: false, reason: "You already have a session running on this device."};
    }

    const clientOps = Object.assign({}, userInfo, {sid});
    let result = this.onJoinRequest(userInfo);
    if(typeof result === 'boolean')
      result = {success: result};
    else if(typeof result !== 'object')
      return {success: false, reason: 'Server error'};

    if(result.success){
      let client = ClientPool.getClient(sid);
      if(!client)
        client = ClientPool.addClient(sid, clientOps);
      result.id = this.id;
      this.onClientAccepted(client, clientOps);
    }
    return result;
  }

  leave(client){
    if(!this.hasClient(client.sid))
      return console.log(`room.js leave error: Client ${client.id || client.sid} not found`);

    this.onClientLeave(client);
  }

  kickAll(){
    for(let [sid, {client}] of this._clients)
      this.leave(client);
  }

  broadcast(event, payload = null, ops = {}){
    const exclusionSet = ops.exclude;

    for(let [sid, {client}] of this._clients){
      if(!client.rejoinRequired && !(exclusionSet && exclusionSet.has && exclusionSet.has(sid)))
        client.socket.emit(`${this.id}${event}`, payload);
    }
  }

  emit(client, event, payload = null){
    if(client)
      client.socket.emit(`${this.id}${event}`, payload);
  }

  addListener(client, inputEvent, listener){
    if(!this.hasClient(client))
      return console.log(`room.js addListener error: Client ${client.id || client.sid} not found`);

    const event = inputEvent === 'disconnect' || inputEvent === 'reconnect' ||
      inputEvent === 'connect' ?
      inputEvent : `${this.id}${inputEvent}`;
    this._getClientListeners(client.sid).set(event, listener);
    client.socket.on(event, listener);
  }

  //************************ Overrideables ************************************

  //Optional override in subclass. If overidden, must call super.
  onClientAccepted(client){
    console.log(`Room: client ${client.id || client.sid} accepted`);
    setTimeout(() => {
      const clientInfo = this._clients.get(client.sid);
      if(clientInfo && !clientInfo.initialized)
        this.leave(client);
    }, this._initTimeout);
    this._clients.set(client.sid,
      {
        client,
        listeners: new Map(),
        initialized: false,
        disconnected: false,
        rejoinRequired: false
      });

    client.addRoom(this);
    this.addListener(client, 'CLIENT_INITIALIZED', () => this.initClient(client));
    this.addListener(client, 'EXIT', () => this.leave(client));
    this.addListener(client, 'disconnect', () => {
      if(this.hasClient(client)){
        const clientInfo = this._clients.get(client.sid);
        if(!clientInfo.disconnected && !clientInfo.rejoinRequired){
          console.log(`Room: client ${client.id || client.sid} disconnected`);
          this.onClientDisconnect(client);
        }
      }
    });
    this.addListener(client, 'reconnect', () => {
      if(this.hasClient(client)){
        const clientInfo = this._clients.get(client.sid);
        if(clientInfo.disconnected && !clientInfo.rejoinRequired){
          console.log(`Room: client ${client.id || client.sid} reconnected`);
          this.onClientReconnect(client);
        }
      }
    });
    this.addListener(client, 'connect', () => {
      //Connect event is necessary incase the websocket disconnects again after
      //connection being re-established, and reconnects again.
      const clientInfo = this._clients.get(client.sid);
      if(clientInfo && clientInfo.disconnected)
        clientInfo.rejoinRequired = true;
    });
  };

  //Optional override in subclass. If overidden, must call super
  onClientLeave(client){
    console.log(`Room: ${client.id || client.sid} left room`);
    this._cleanupClient(client);
  }

  //Optional override in subclass. If overidden, must call super
  onClientDisconnect(client){
    const clientInfo = this._clients.get(client.sid);
    if(clientInfo){
        clientInfo.disconnected = true;

      if(this._reconnectTimeout >= 0){
        setTimeout(() => {
          if(clientInfo.disconnected)
            this.leave(client);
        }, this._reconnectTimeout);
      }
    }
  }

  //Optional overrid in subclass. If overidden, must call super
  onClientReconnect(client){
    const clientInfo = this._clients.get(client.sid);
    if(clientInfo)
      clientInfo.disconnected = false;
  }

  /*Optional override in subclass. If overidden, must call super. When
    initClient is called, it can be assumed that the client is fully initialized
  */
  initClient(client){
    this._clients.get(client.sid).initialized = true;
  }

  //Optional override in subclass. Do not call super.
  onJoinRequest(userInfo){return {success: true};}




  //****************Private functions. Not part of API.************************
  _onClientRejoin(clientInfo){
    const client = clientInfo.client;
    const oldListener = this._getClientListeners(clientInfo.client.sid).get(`${this.id}CLIENT_INITIALIZED`);
    client.socket.removeListener(`${this.id}CLIENT_INITIALIZED`, oldListener);
    this.addListener(client, 'CLIENT_INITIALIZED', () => {
      clientInfo.rejoinRequired = false;
      this.onClientReconnect(client);
    });
  }

  _getClientListeners(sid){
    const clientInfo = this._clients.get(sid);
    return clientInfo && clientInfo.listeners;
  }

  _cleanupClient(client){
    const listeners = this._getClientListeners(client.sid);
    if(listeners){
      for(let [event, listener] of listeners)
        client.socket.removeListener(event, listener);
    }

    this._clients.delete(client.sid);
    client.removeRoom(this);
  }
}

module.exports.initialize = (server, ops = {}) => {

  let ipHeader = null;

  if(ops.sidHeader)
    sidHeader = ops.sidHeader;
  if(ops.ipHeader)
    ipHeader = ops.ipHeader;

  const wsServer = new WebSocket.Server({server});

  wsServer.shouldHandle = req => {
    const sid = getCookie(req.headers.cookie, sidHeader);
    const client = ClientPool.getClient(sid);
    if(!sid || !client){
      console.log(`Refused unexpected websocket connection from ${ipHeader ? req.headers[ipHeader] : ''}`);
      return false;
    }

    return true;
  };

  wsServer.on('connection', function(rawWs, req){
    const sid = getCookie(req.headers.cookie, sidHeader);
    const client = ClientPool.getClient(sid);
    if(!sid || !client){
      console.log(`Refused unexpected websocket connection from ${ipHeader ? req.headers[ipHeader] : ''}`);
      return rawWs.terminate();
    }
    const live = parse(req.url, true).query.live;
    const isReconnect = live === 'true' ? true : false;
    client.socket.setRawSocket(rawWs, isReconnect);
    console.log(`[INFO] ${client.id} opened new websocket session from ${client.ip}.`);
  });
}

function getCookie(cookieStr, name){
  const decodedCookie = decodeURIComponent(cookieStr);
  const ca = decodedCookie.split(';');
  for(let i = 0; i <ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) == ' ') {
      c = c.substring(1);
    }
    if (c.indexOf(name) == 0) {
      return c.substring(name.length+1, c.length);
    }
  }
}
