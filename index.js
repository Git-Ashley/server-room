//const UTILS = require('../../config.js').UTILS;
const ClientPool = require('./ClientPool');
const randomStr = require('./random-string.js');
//const EventTypes = require('../event-types.js');

/* Hooks (*: Must call super. ^: Do not call super)
---------------------------------------------------------
*onClientAccepted: When client is accepted & expected to join shortly, but not yet initialized
*onClientDisconnect: When client disconnects
*onClientDisconnect: When client disconnects
*initClient: Hook for when client is initialized on client side. This is the time to register socket events on server side with client. Also optionally you can choose to emit initial startup data (if required) along with an event to tell user the server is also initialized, such as in a game. But note, when at this point, the user is already receiving the rooms events, but cannot emit anything yet. Whether or not you want the user to react to those events or wait for initial startup data and a startup signal is a choice to be made by you!
*onClientLeave: When client leaves. Be aware that this may happen any time after onClientAccepted (including before initClient called)
^onJoinRequest: Return true if permission granted to join, false otherwise. If not overidden, permission is always granted

****Options to constructor*****
initTimeout: time in milliseconds for client to notify initialization
  complete (via initialize() on client) before being kicked. (default 10 sec)
reconnectTimeout: time in milliseconds that clients have to reconnect upon disconnect. If
  ${timeout} seconds passes without reconnecting, client will be booted from room.
  (default 0ms)
*/

module.exports = class Room {
  constructor(ops = {}){
    this._clients = new Map();
    this._id = randomStr();
    this._initTimeout = ops.initTimeout || 10000;
    this._reconnectTimeout = ops.reconnectTimeout || 0;
  }

  get id(){
    return this._id;
  }

  get clients(){
    return this._clients;
  }

  //Returns array of clients
  /*get clients(){
    //TODO
  }*/

  hasClient(inputClient){
    const clientId = typeof inputClient === 'string' ? inputClient : inputClient.id;
    return Boolean(this.clients.get(clientId));
  }

  getClientById(clientId){
    const clientInfo = this.clients.get(clientId);
    return clientInfo && clientInfo.client;
  }

  _getClientListeners(clientId){
    const clientInfo = this.clients.get(clientId);
    return clientInfo && clientInfo.listeners;
  }

  _initTimeout(client){
    const clientInfo = this.clients.get(client.id);
    if(clientInfo && !clientInfo.initialized)
      this.leave(client);
  }

  //userInfo must contain at least an id property
  join(sid, userInfo){
    //TODO check if disconnected first, then return success: true, reconnect: true
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

  _cleanupClient(client){
    const listeners = this._getClientListeners(client.id);
    if(listeners){
      for(let [event, listener] of listeners)
        client.socket.removeListener(event, listener);
    }

    this.clients.delete(client.id);
    client.removeRoom(this);
  }

  leave(client){
    if(!this.hasClient(client.id))
      return console.log(`room.js leave error: Client ${client.id} not found`);

    this.onClientLeave(client);
  }

  broadcast(event, ...args){
    //console.log(`emitting ${this.id}${event}`);
    for(let [id, {client}] of this.clients)
      client.socket.emit(`${this.id}${event}`, ...args);
  }

  emit(client, event, payload = null){
    if(client)
      client.socket.emit(`${this.id}${event}`, payload);
  }

  addListener(client, inputEvent, listener){
    if(!this.hasClient(client))
      return console.log(`room.js addListener error: Client ${client.id} not found`);

    const event = inputEvent === 'disconnect' || inputEvent === 'reconnect' ?
      inputEvent : `${this.id}${inputEvent}`;
    this._getClientListeners(client.id).set(event, listener);
    client.socket.on(event, listener);
  }

  //************************ Overrideables ************************************

  //Optional override in subclass. If overidden, must call super.
  onClientAccepted(client){
    console.log(`client ${client.id} accepted`);
    setTimeout(() => {
      this._initTimeout(client);
    }, this._initTimeout);
    this.clients.set(client.id, {client, listeners: new Map(), initialized: false, disconnected: false});
    client.addRoom(this);
    this.addListener(client, 'CLIENT_INITIALIZED', () => this.initClient(client));
    this.addListener(client, 'EXIT', () => this.leave(client));
    this.addListener(client, 'disconnect', () => {
      console.log(`client ${client.id} disconnected`);
      if(this.hasClient(client))
        this.onClientDisconnect(client);
    });
    this.addListener(client, 'reconnect', () => {
      console.log(`client ${client.id} reconnected`);
      if(this.hasClient(client))
        this.onClientReconnect(client);
    });
  };

  //Optional override in subclass. If overidden, must call super
  onClientLeave(client){
    console.log(`${client.id} left room`);
    this._cleanupClient(client);
  }

  //Optional override in subclass. If overidden, must call super
  onClientDisconnect(client){
    const clientInfo = this.clients.get(client.id);
    if(clientInfo)
      clientInfo.disconnected = true;

    if(this._reconnectTimeout >= 0){
      this.setTimeout(() => {
        if(clientInfo.disconnected)
          this.leave(client);
      }, this._reconnectTimeout);
    }
  }

  //Optional overrid in subclass. If overidden, must call super
  onClientReconnect(client){
    const clientInfo = this.clients.get(client.id);
    if(clientInfo)
      clientInfo.disconnected = false;
  }

  /*Optional override in subclass. If overidden, must call super. When
    initClient is called, it can be assumed that the client is fully initialized
  */
  initClient(client){
    this.clients.get(client.id).initialized = true;
  }

  //Optional override in subclass. Do not call super.
  onJoinRequest(userInfo){return {success: true};}
}

module.exports.ClientPool = ClientPool;
