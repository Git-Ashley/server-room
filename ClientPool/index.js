//Pool of client connections
const Client = require('./Client');

class ClientPool {
  constructor(){
    this._clientWsPool = new Map();
  }

  getClient(id){
    return this._clientWsPool.get(id);
  }

  addClient(sid, inputOps){
    const ops = Object.assign({}, inputOps, {sid});
    const newClient = new Client(ops);
    this._clientWsPool.set(sid, {client: newClient});
    return newClient;
  }
}

const clientPool = new ClientPool();
module.exports = clientPool;
