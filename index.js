//const UTILS = require('../../config.js').UTILS;
const ClientPool = require('./ClientPool');
const randomStr = require('./random-string.js');
const {parse} = require('url');
//const EventTypes = require('../event-types.js');

/* Hooks (*: Must call super. ^: Do not call super)
---------------------------------------------------------
*onClientAccepted: When client is accepted & expected to join shortly, but not yet initialized
*onClientDisconnect: When client disconnects
*initClient: Hook for when client is initialized on client side. This is the time to register socket events on server side with client. Also optionally you can choose to emit initial startup data (if required) along with an event to tell user the server is also initialized, such as in a game. But note, when at this point, the user is already receiving the rooms events, but cannot emit anything yet. Whether or not you want the user to react to those events or wait for initial startup data and a startup signal is a choice to be made by you!
*onClientLeave: When client leaves. Be aware that this may happen any time after onClientAccepted even before the client has initialized
^onJoinRequest: Return true if permission granted to join, false otherwise. If not overidden, permission is always granted

****Options to constructor*****
initTimeout: time in milliseconds for client to notify initialization
  complete (via initialize() on client) before being kicked. (default 10 sec)
  If 0 is passed, then initClient will be called straight away and will not wait
  for the client to invoke initialized(). This is faster and useful for if there
  is no initial data that needs to be sent to the client.
reconnectTimeout: time in milliseconds that clients have to reconnect upon disconnect. If
  ${timeout} seconds passes without reconnecting, client will be booted from room.
  (default 0ms)

*/

module.exports = class Room {
  constructor(ops = {}){
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

  getClientBySid(sid){
    const clientInfo = this._clients.get(sid);
    return clientInfo && clientInfo.client;
  }

  //userInfo must contain at least an id property
  join(sid, userInfo){
    if(!sid){
      console.log('Room error: sid must be provided as first argument in join()');
      return {success: false, reason: 'Server error'};
    }

    const clientInfo = this._clients.get(sid);
    if(clientInfo && (clientInfo.disconnected || clientInfo.rejoinRequired)){
      clientInfo.rejoinRequired = true;
      this._onClientRejoin(clientInfo);
      return {success: true, id: this.id};
    } else if (clientInfo){
      return {success: false, reason: "You already have a session running on this device."};
    }

    const result = this.onJoinRequest(userInfo);
    if(result.success){
      let client = ClientPool.getClient(sid);
      if(!client)
        client = ClientPool.addClient(sid, userInfo);
      result.id = this.id;
      this.onClientAccepted(client, userInfo);
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

  broadcast(event, ...args){
    //console.log(`emitting ${this.id}${event}`);
    for(let [sid, {client}] of this._clients){
      if(!client.rejoinRequired)
        client.socket.emit(`${this.id}${event}`, ...args);
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
      if(clientInfo && clientInfo.disconnected){
        clientInfo.rejoinRequired = true;
        clientInfo.disconnected = false;
      }
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

module.exports.initialize = (wsServer, ops = {}) => {
  const sidHeader = ops.sidHeader || 'sid';

  wsServer.shouldHandle = req => {
    const sid = getCookie(req.headers.cookie, sidHeader);
    const client = ClientPool.getClient(sid);
    if(!sid || !client){
      console.log(`Refused unexpected websocket connection from ${ops.ipHeader ? req.headers[ops.ipHeader] : ''}`);
      return false;
    }

    return true;
  };

  wsServer.on('connection', function(rawWs, req){
    const sid = getCookie(req.headers.cookie, sidHeader);
    const client = ClientPool.getClient(sid);
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
