//const UTILS = require('../../config.js').UTILS;
const ClientPool = require('./ClientPool');
const randomStr = require('./random-string.js');
const WebSocket = require('ws');
const {parse} = require('url');
let sidHeader = 'sid';

// A Client represents a unique sid *AND* ID combination. Same sid with diff ID === diff client.
module.exports = class Room {
  constructor(ops = {}){
    this._sidHeader = ops.sidHeader;
    this._clients = new Map();
    this._id = randomStr();
    this._name = ops.name || this._id;
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
    return clientInfo && !clientInfo.disconnected && client.socket.isOpen();
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
      return { success: false, reason: 'Server error' };
    }

    const clientInfo = this._clients.get(sid);
    if(clientInfo && clientInfo.disconnected){
      if(userInfo.id === clientInfo.client.id){
        this.onClientReconnect(clientInfo.client);
        return {success: true, id: this.id};
      } else {
        // The client is using the same session under a different ID. Leave with the other ID and instigate a new join
        // review.
        clientInfo.disconnected = false;
        this.leave(clientInfo.client);
      }
    } else if (clientInfo){
      return {success: false, reason: "You already have a session running on this device."};
    }

    let client = ClientPool.getClient(sid);

    const clientOps = Object.assign({}, userInfo, {sid, client});
    let result = this.onJoinRequest(clientOps);
    if(typeof result === 'boolean')
      result = {success: result};
    else if(typeof result !== 'object')
      return {success: false, reason: 'Server error'};

    if(result.success){
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
      if(!(exclusionSet && (exclusionSet.has(sid) || exclusionSet.has(client.id))))
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

    const event = ['disconnect', 'reconnect', 'connect'].includes(inputEvent) ? inputEvent : `${this.id}${inputEvent}`;
    this._getClientListeners(client.sid).set(event, listener);
    client.socket.on(event, listener);
  }

  //************************ Overrideables ************************************

  //Optional override in subclass. If overidden, must call super.
  onClientAccepted(client){
    console.info(`Room: client ${client.id || client.sid} accepted`);
    this._clients.set(client.sid,
      {
        client,
        listeners: new Map(),
        disconnected: false
      });

    client.addRoom(this);
    this.addListener(client, 'EXIT', () => this.leave(client));
    this.addListener(client, 'disconnect', () => {
      if(this.hasClient(client)){
        const clientInfo = this._clients.get(client.sid);
        if(!clientInfo.disconnected){
          console.log(`Room: client ${client.id || client.sid} disconnected`);
          this.onClientDisconnect(client);
        }
      }
    });
    this.addListener(client, 'reconnect', () => {
      if(this.hasClient(client)){
        console.log(`Room: client ${client.id || client.sid} reconnected`);
        if (this.onClientReconnect)
          this.onClientReconnect(client);
      }
    });

    if (this.onClientConnect) {
      if (this.isConnected(client)) {
        process.nextTick(() => this.onClientConnect(client));
      } else {
        this.addListener(client, 'connect', () => this.onClientConnect(client));
      }
    }
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

  initClient(client){}

  //Optional override in subclass. Call to super is not necessary.
  onJoinRequest(userInfo){return {success: true};}




  //****************Private functions. Not part of API.************************
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

function union(setA, setB) {
  const _union = new Set(setA);
  for (let elem of setB) {
    _union.add(elem);
  }
  return _union;
}

module.exports.WithReadyCheck = class RoomWithInitialization extends Room {
  constructor(...params) {
    super(...params);
    this.initializing = new Set();
  }

  onClientAccepted(client) {
    super.onClientAccepted(client);
    this._onClientInitialized(client, this.onClientReady);
  }

  //Will always require re-sending room state
  onClientReconnect(client) {
    super.onClientReconnect(client);
    this._onClientInitialized(client, this.onClientReconnectReady);
  }

  _onClientInitialized(client, callback) {
    if (!this.initializing.has(client.id)) {
      const listener = () => {
        callback.call(this, client);
        client.socket.removeListener(`${this.id}CLIENT_INITIALIZED`, listener);
        this.initializing.delete(client.id);
      };

      this.initializing.add(client.id);
      this.addListener(client, 'CLIENT_INITIALIZED', listener);
    }
  }

  onClientReady() { /** Override. Call to super not necessary. This is called when client has called initialized() on frontend. */ }

  onClientReconnectReady() { /** Override this instead of onClientReconnect if you have opted into disconnect/reconnect functionality */ }

  broadcast(event, payload, ops = {}) {
    const newOps = ops;
    if (newOps.exclude) {
      newOps.exclude = union(newOps.exclude, this.initializing);
    } else {
      newOps.exclude = this.initializing;
    }

    super.broadcast(event, payload, newOps);
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
    const isReconnect = live === 'true';
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
