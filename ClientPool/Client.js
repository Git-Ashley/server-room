const SocketHandler = require('./SocketHandler');

module.exports = class Client {
  constructor(ops = {}){
    if(!ops.sid)
      return console.log('ERROR: sid must not be empty!');
    if(!ops.onLeftAllRooms)
      return console.log('ERROR: onLeftAllRooms must be defined!');
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
    this._onLeftAllRooms = ops.onLeftAllRooms;
  }

  addRoom(room){
    this._rooms.set(room.id, room);
  }

  removeRoom(room){
    this._rooms.delete(room.roomId);
    if(!this._rooms.size){
      console.log(`Client: ${this.id || this.sid} left all rooms`);
      this._onLeftAllRooms(this.sid);
    }
  }

  in(inputRoom){
    const room = this._rooms.get(inputRoom.roomId);
    if(room)
      return true;
    else
      return false;
  }

  leaveAllRooms(){
    console.log(`${this.id || this.sid} leaving all rooms`);
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

  set sid(sid){
    this._sid = sid;
  }

  get ip(){
    return this._ip;
  }

  get socket(){
    return this._socketHandler;
  }

  get rooms(){
    return this._rooms;
  }

  /*get status(){
    return this.socket.status;
  }*/

}
