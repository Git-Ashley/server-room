const SocketHandler = require('./SocketHandler');
const Status = {
  PENDING: 'PENDING',
  CONNECTED: 'CONNECTED'
};

module.exports = class Client {
  constructor(ops = {}){
    if(!ops.username && !ops.id)
      return console.log('ERROR: username and ID cannot both be empty!');
    if(!ops.socket){
      this._status = Status.PENDING;
      this._socket = new SocketHandler();
    } else {
      this._status = Status.CONNECTED;
      this._socket = new SocketHandler(ops.socket);
    }

    //this._ip = socket.request.headers['x-real-ip'];
    this._username = ops.username;
    this._id = ops.id || ops.username;
    this._rooms = new Map();

    //TODO remove and test it still works...
    this.addRoom = this.addRoom.bind(this);
    this.removeRoom = this.removeRoom.bind(this);
    this.in = this.in.bind(this);
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
    return this._id || this._username;
  }

  get username(){
    return this._username || this._id;
  }

  get status(){
    return this._status;
  }

  //TODO
  /*get ip(){
    return this._ip;
  }*/

  get socket(){
    return this._socket;
  }

  set socket(socket){
    if(this.status === Status.CONNECTED){
      this._socket.terminate();
      this._socket.setRawSocket(socket);
    } else if(this.status === Status.PENDING) {
      this._socket.setRawSocket(socket);
      this._status = Status.CONNECTED;
    }
  }
}
