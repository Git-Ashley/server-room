//Pool of client connections
const Client = require('./Client');

class ClientPool {
  constructor(){
    this._clientWsPool = new Map();
    this.removeClient = this.removeClient.bind(this);
  }

  getClient(sid){
    return this._clientWsPool.get(sid);
  }

  addClient(sid, userInfo){
    const ops = Object.assign({}, userInfo, {sid, onLeftAllRooms: this.removeClient});
    const newClient = new Client(ops);
    this._clientWsPool.set(sid, newClient);
    return newClient;
  }

  removeClient(sid){
    const client = this._clientWsPool.get(sid);
    if(client){
      client.socket.terminate();
      console.log(`ClientPool::removeClient Terminated websocket connection with ${client.id} (${client.ip})`);
    }
    this._clientWsPool.delete(sid);
  }
}

const clientPool = new ClientPool();
module.exports = clientPool;
