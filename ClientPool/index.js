//Pool of client connections
const Client = require('./Client');

class ClientPool {
  constructor(){
    this._clientWsPool = new Map();
  }

  getClient(id){
    return this._clientWsPool.get(id);
  }

  addClient(sid, userId){
    const newClient = new Client({id: userId, sid});
    this._clientWsPool.set(sid, {client: newClient});
    return newClient;
  }
}

const clientPool = new ClientPool();
module.exports = clientPool;
