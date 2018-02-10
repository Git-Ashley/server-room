// Server socket handler
const WebSocket = require('ws');


/*
* Emits 'disconnect' event when socket disconnects
*/

module.exports = class SocketHandler {

  constructor(ws = null, ops = {}){
    this._ws = ws;
    this._id = ops.id; // Just for logging purposes
    this._eventListeners = {};
    this._isAlive = false;
    if(this._ws)
      this._init();

    this._pingInterval = ops.pingInterval || 3000;
    this.on('pong', () => this._isAlive = true);
  }

  get id(){
    return this._id || null;
  }

  _init(){
    this._ws.addEventListener('message', eventJson => {
      const event = JSON.parse(eventJson.data);
      const listeners = this._eventListeners[event.type];

      if(!listeners)
        return console.log(`${this.id} No listeners for event ${event.type}!`);

      for(let listener of listeners)
        listener(event.data);
    });

    this._ws.addEventListener('close', () => {
      const listeners = this._eventListeners['disconnect'];
      if(listeners)
        listeners.forEach(listener => listener());
    });

    this._ws.addEventListener('error', error => {
      console.log(`SocketHandler error: ${error}`);
    });

    this._heartBeat();
  }

  setRawSocket(socket, isReconnect){
    if(this._ws && (this._ws.readyState === WebSocket.CONNECTING || this._ws.readyState === WebSocket.OPEN))
      this._ws.terminate();

    this._ws = socket;
    this._init();

    const eventType = isReconnect ? 'reconnect' : 'connect';
    console.log(`SocketHandler: Socket ${eventType}ed`);
    const listeners = this._eventListeners[eventType];
    if(listeners)
      listeners.forEach(listener => listener());
  }

  on(event, listener){

    if(!this._eventListeners[event]){
      this._eventListeners[event] = new Set([listener]);
    } else {
      if(this._eventListeners[event].has(listener))
        console.log(`Same listener has been registered more than once for event ${event}!`);

      this._eventListeners[event].add(listener);
      if(this._eventListeners.lenth >= 5)
        console.log(`POSSIBLE MEMORY LEAK: event ${event} has ${this._eventListeners.length} listeners.`);
    }
  }

  removeListener(event, listener){
    const listeners = this._eventListeners[event];
    if(listeners && listeners.has(listener))
      listeners.delete(listener);
    else
      console.log(`Attempted to remove listener for ${event}, but listener was not found`);

    if(!listeners || listeners.size === 0)
      delete this._eventListeners[event];
  }

  emit(type, data){
    if(!this._ws)
      return console.log(`${new Date()}: Attempting to emit message to uninitialized socket`);

    if(this._ws.readyState === WebSocket.OPEN)
      this._ws.send(JSON.stringify({type,data}));
  }

  close(...args){
    this._ws.close(...args)
  }

  terminate(){
    if(this._ws){
      this._ws.terminate();
      this._ws = null;
    }
  }

  _heartBeat(){
    this._isAlive = false;
    this.emit('ping');

    setTimeout(() => this._isAlive ? this._heartBeat() : this.terminate(), this._pingInterval);
  }
}
