//Pool of client connections
const Client = require('./Client');

class ClientPool {
  constructor(){
    this._clientWsPool = new Map();
  }

  getClient(id){
    return this._clientWsPool.get(id);
  }

  addClient(key, userId){
    const newClient = new Client({id: userId});
    this._clientWsPool.set(key, newClient);
    return newClient;
  }
}

const clientPool = new ClientPool();
module.exports = clientPool;
