const SocketHandler = require('./SocketHandler');
const Status = {
  PENDING: 'PENDING',
  CONNECTED: 'CONNECTED',
  DISCONNECTED: 'DISCONNECTED'
};

module.exports = class Client {
  constructor(ops = {}){
    if(!ops.sid)
      return console.log('ERROR: sid must not be empty!');
    if(!ops.username && !ops.id)
      return console.log('ERROR: username and ID cannot both be empty!');
    if(!ops.socket){
      this._status = Status.PENDING;
      this._socket = new SocketHandler(null);
    } else {
      this._status = Status.CONNECTED;
      this._socket = new SocketHandler(ops.socket);
    }

    this.onDisconnect(() => {
      this._status = Status.DISCONNECTED;
    });

    //this._ip = socket.request.headers['x-real-ip'];
    this._username = ops.username;
    this._id = ops.id || ops.username;
    this._ip = ops.ip;
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

  onDisconnect(listener){
    this.socket.onDisconnect(listener);
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

  get ip(){
    return this._ip;
  }

  get socket(){
    return this._socket;
  }

  set socket(socket){
    if(this.status === Status.CONNECTED){
      this._socket.terminate();
      this._socket.setRawSocket(socket);
    } else {
      this._socket.setRawSocket(socket);
      this._status = Status.CONNECTED;
    }
  }
}
