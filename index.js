//const UTILS = require('../../config.js').UTILS;
const ClientPool = require('./ClientPool');
const randomStr = require('./random-string.js');
//const EventTypes = require('../event-types.js');

/* Overridable (*: Must call super. ^: Do not call super)
---------------------------------------------------------
*onClientAccepted: When client is accepted & expected to join shortly, but not yet initialized
*onClientLeave: When client leaves
*onClientDisconnect: When client disconnects
*initClient: Hook for when client is initialized on client side. This is the time to register socket events on server side with client. Also optionally you can choose to emit initial startup data (if required) along with an event to tell user the server is also initialized, such as in a game. But note, when at this point, the user is already receiving the rooms events, but cannot emit anything yet. Whether or not you want the user to react to those events or wait for initial startup data and a startup signal is a choice to be made by you!
^onJoinRequest
*/

module.exports = class Room {
  constructor(ops = {}){
    this._clients = new Map();
    this._id = ops.id || randomStr();
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

  hasClient(client){
    return Boolean(this.clients.get(client.id));
  }

  getClient(clientId){
    const clientInfo = this.clients.get(clientId);
    return clientInfo && clientInfo.client;
  }

  _getClientListeners(clientId){
    const clientInfo = this.clients.get(clientId);
    return clientInfo && clientInfo.listeners;
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
    console.log(`emitting ${this.id}${event}`);
    for(let [id, {client}] of this.clients)
      client.socket.emit(`${this.id}${event}`, ...args);
  }

  emit(client, event, payload = null){
    if(client)
      client.socket.emit(`${this.id}${event}`, payload);
  }

  addListener(client, event, listener){
    if(!this.hasClient(client))
      return console.log(`room.js addListener error: Client ${client.id} not found`);

    //console.log(`registering listener ${this.id}${event}`);
    this._getClientListeners(client.id).set(`${this.id}${event}`, listener);
    if(event === 'disconnect' || event === 'DISCONNECT')
      client.socket.on(event, listener);
    else
      client.socket.on(`${this.id}${event}`, listener);
  }

  //************************ Overrideables ************************************

  //Optional override in subclass. If overidden, must call super.
  onClientAccepted(client){
    this.clients.set(client.id, {client, listeners: new Map(), initialized: false});
    this.addListener(client, 'CLIENT_INITIALIZED', () => this.initClient(client));
    this.addListener(client, 'EXIT', () => this.leave(client));
    this.addListener(client, 'disconnect', () => {
      console.log(`client ${client.id} disconnected`);
      this.onClientDisconnect(client);
    });
  };

  //Optional override in subclass. If overidden, must call super
  onClientLeave(client){
    this._cleanupClient(client);
  }

  //Optional override in subclass. If overidden, must call super
  onClientDisconnect(client){
    //TODO add a timeout option until leave (0 = boot instant, -1 = indefinite)
    //TODO Add functionality where client iterates over its rooms after reconnect and rejoins them all (join() checks for if client already there with disconnected status). Or similar.
    this._cleanupClient(client);
  }

  /*
  onClientReconnect(){
    //TODO
  }
  */

  /*Optional override in subclass. If overidden, must call super. When
    initClient is called, it can be assumed that the client is fully initialized
  */
  initClient(client){
    this.clients.get(client.id).initialized = true;
    client.addRoom(this);
  }

  //Optional override in subclass. Do not call super.
  onJoinRequest(client){return {success: true};}
}

module.exports.ClientPool = ClientPool;
