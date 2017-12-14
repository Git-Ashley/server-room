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
^requestJoin
*/

module.exports = class Room {
  constructor(ops = {}){
    this._clients = new Map();
    this._id = ops.id || randomStr();

    //bindings
    this.join = this.join.bind(this);
    this.leave = this.leave.bind(this);
    this.broadcast = this.broadcast.bind(this);
  }

  get id(){
    return this._id;
  }

  //Returns array of clients
  /*get clients(){
    //TODO
  }*/

  hasClient(clientId){
    return Boolean(this._clients.get(clientId));
  }

  getClient(clientId){
    const clientInfo = this._clients.get(clientId);
    return clientInfo && clientInfo.client;
  }

  getClientListeners(clientId){
    const clientInfo = this._clients.get(clientId);
    return clientInfo && clientInfo.listeners;
  }

  //userInfo must contain at least an id property
  join(sid, userInfo){
    const result = this.requestJoin(userInfo);
    if(result.success){
      const clientInfo = ClientPool.getClient(sid);
      let client = clientInfo && clientInfo.client;
      if(!client)
        client = ClientPool.addClient(sid, userInfo);
      result.id = this.id;
      this.onClientAccepted(client);
    }
    return result;
  }

  _cleanupClient(client){
    const listeners = this.getClientListeners(client.id);
    if(listeners){
      for(let [event, listener] of listeners)
        client.socket.removeListener(event, listener);
    }

    this._clients.delete(client.id);
    client.removeRoom(this);
  }

  leave(client){
    if(!this.hasClient(client.id))
      return console.log(`room.js leave error: Client ${client.id} not found`);

    this.onClientLeave(client);
  }

  broadcast(event, ...args){
    console.log(`emitting ${this.id}${event}`);
    console.log(`number of clients: ${this._clients.size}`);
    console.log('TODO: add disconnect listener to remove users!');
    for(let [id, {client}] of this._clients){
      client.socket.emit(`${this.id}${event}`, ...args);
    }
  }

  addListener(client, event, listener){
    if(!this.hasClient(client))
      return console.log('room.js addListener error: Client not found');

    //console.log(`registering listener ${this.id}${event}`);
    this.getClientListeners(client.id).set(`${this.id}${event}`, listener);
    client.socket.on(`${this.id}${event}`, listener);
  }


  //************************ Overrideables ************************************

  //Optional override in subclass. If overidden, must call super.
  onClientAccepted(client){
    this.addListener(client, 'CLIENT_INITIALIZED', () => {
      this._clients.set(client.id, {client, listeners: new Map()});
      this.addListener(client, 'EXIT', () => this.leave(client));
      this.initClient(client);
    });
    client.onDisconnect(() => {
      this.onClientDisconnect(client);
    });
  };

  //Optional override in subclass. If overidden, must call super
  onClientLeave(client){
    this._cleanupClient(client);
  }

  //Optional override in subclass. If overidden, must call super
  onClientDisconnect(client){
    //TODO add timer... if client does not request to join again within a certain time, boot. Add to list of disconnectedClients, then requestJoin can scan this, and launch a onClickReconnect() ?
    this._cleanupClient(client);
  }

  /*
  onClientReconnect(){
    re-add to room, and add onDisconnect listener again
  }
  */

  /*Optional override in subclass. If overidden, must call super. When
    initClient is called, it can be assumed that the client is fully initialized
  */
  initClient(client){
    client.addRoom(this);
  }

  //Optional override in subclass. Do not call super.
  requestJoin(client){return {success: true};}
}

module.exports.ClientPool = ClientPool;
