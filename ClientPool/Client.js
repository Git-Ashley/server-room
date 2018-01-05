const SocketHandler = require('./SocketHandler');
const ClientPool = require('./index.js');

module.exports = class Client {
  constructor(ops = {}){
    if(!ops.sid)
      return console.log('ERROR: sid must not be empty!');
    if(!ops.id)
      return console.log('ERROR: ID cannot be empty!');
    if(!ops.socket){
      this._socketHandler = new SocketHandler(null);
    } else {
      this._socketHandler = new SocketHandler(ops.socket);
    }

    this._username = ops.username;
    this._id = ops.id;
    this._ip = ops.ip;
    this._sid = ops.sid;
    this._rooms = new Map();
  }

  addRoom(room){
    this._rooms.set(room.roomId, room);
  }

  removeRoom(room){
    this._rooms.delete(room.roomId);
    if(!this._rooms.size)
      ClientPool.removeClient(this.sid);
  }

  in(inputRoom){
    const room = this._rooms.get(inputRoom.roomId);
    if(room)
      return true;
    else
      return false;
  }

  leaveAllRooms(){
    console.log(`${this.username} leaving all rooms`);
    for(let [roomId, room] of this._rooms)
      room.leave(this);
    this._rooms.clear();
  }

  get id(){
    return this._id;
  }

  get sid(){
    return this._sid;
  }

  get username(){
    return this._username || this._id;
  }

  get ip(){
    return this._ip;
  }

  get socket(){
    return this._socketHandler;
  }

  /*get status(){
    return this.socket.status;
  }*/

  set socket(socket){
    this._socketHandler.setRawSocket(socket);
  }
}
