//const UTILS = require('../../config.js').UTILS;
const ClientPool = require('./ClientPool');
const randomStr = require('./random-string.js');
//const EventTypes = require('../event-types.js');

/* Overridable:
----------------
_onClientAccepted
_onClientLeave
_initClient
_canJoin
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

  //********************************** API *************************************
  get id(){
    return this._id;
  }

  get clients(){
    return this._clients;
  }

  hasClient(client){
    let clientInfo = null;
    if(client !== null && typeof client === 'object')
      clientInfo = this.clients.get(client.id);
    else //assume id string
      clientInfo = this.clients.get(client);

    if(!clientInfo)
      return false;
    else
      return true;

  }

  //userInfo must contain at least an id property
  join(sid, userInfo){
    const result = this._canJoin(userInfo);
    if(result.success){
      let client = ClientPool.getClient(sid);
      if(!client)
        client = ClientPool.addClient(sid, userInfo.id);
      result.id = this.id;
      this._onClientAccepted(client);
    }
    return result;
  }

  leave(client){
    if(!this.hasClient(client))
      return console.log('room.js leave() error: Client not found');

    this._onClientLeave(client);
  }

  broadcast(event, ...args){
    console.log(`emitting ${this.id}${event}`);
    console.log(`number of clients: ${this.clients.size}`);
    console.log('TODO: add disconnect listener to remove users!');
    for(let [id, {client}] of this.clients){
      client.socket.emit(`${this.id}${event}`, ...args);
    }
  }
  //****************************************************************************

  //Optional override in subclass. If overidden, must call super.
  _onClientAccepted(client){
    this.clients.set(client.id, {client, listeners: new Map()});
    this._addListener(client, 'CLIENT_INITIALIZED', () => {
      this._initClient(client);
    });
    this._addListener(client, 'EXIT', () => this.leave(client));
  };

  //Optional override in subclass. If overidden, must call super.
  _onClientLeave(client){
    //console.log(`client ${client.id} leaving`);
    const listeners = this.clients.get(client.id).listeners;
    for(let [event, listener] of listeners)
      client.socket.removeListener(event, listener);
    this.clients.delete(client.id);
    client.removeRoom(this);
  }

  /*Optional override in subclass. If overidden, must call super. When
    initClient is called, it can be assumed that the client is fully initialized
  */
  _initClient(client){
    client.addRoom(this);
    this.broadcast('CLIENT_JOINED', client.publicProfile);
  }

  //Optional override in subclass. Do not call super.
  _canJoin(client){return {success: true};}

  _addListener(client, event, listener){
    if(!this.hasClient(client))
      return console.log('room.js addListener error: Client not found');

    //console.log(`registering listener ${this.id}${event}`);
    this.clients.get(client.id).listeners.set(`${this.id}${event}`, listener);
    client.socket.on(`${this.id}${event}`, listener);
  }
}

module.exports.ClientPool = ClientPool;
