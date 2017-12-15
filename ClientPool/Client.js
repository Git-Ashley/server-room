const SocketHandler = require('./SocketHandler');
const Status = {
  INITIALIZING: 'INITIALIZING',
  CONNECTED: 'CONNECTED',
  DISCONNECTED: 'DISCONNECTED'
};

module.exports = class Client {
  constructor(ops = {}){
    if(!ops.sid)
      return console.log('ERROR: sid must not be empty!');
    if(!ops.id)
      return console.log('ERROR: ID cannot be empty!');
    if(!ops.socket){
      this._status = Status.INITIALIZING;
      this._socketHandler = new SocketHandler(null);
    } else {
      this._status = Status.CONNECTED;
      this._socketHandler = new SocketHandler(ops.socket);
    }

    this._username = ops.username;
    this._id = ops.id;
    this._ip = ops.ip;
    this._rooms = new Map();

    this._socketHandler.on('disconnect', () => this._status = Status.DISCONNECTED);
  }

  addRoom(room){
    this._rooms.set(room.roomId, room);
  }

  removeRoom(room){
    this._rooms.delete(room.roomId);
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

  get username(){
    return this._username || this._id;
  }

  get status(){
    return this._status;
  }

  get ip(){
    return this._ip;
  }

  get socket(){
    return this._socketHandler;
  }

  set socket(socket){
    if(this.status === Status.CONNECTED)
      this._socketHandler.terminate();

    this._socketHandler.setRawSocket(socket);
  }
}
