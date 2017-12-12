# server-room
'Room' design pattern for the server



If you want to store extra player info do as so:

```javascript
//This will set the client pool sid -> client mapping automatically
const result = testRoom.join(sid, {id: sid.slice(6)});
//If that was all done succesfully, set the extra information... e.g.
if(result.success){
  const client = ClientPool.get(sid);
  if(!client)
    //what's going on?!
    return;

  //now ClientPool.get(sid) contains {client}. You are free to add more info as you wish, e.g:
  const newPlayer = Player(client, ...);
  ClientPool.get(sid).player = newPlayer;

}
```

ClientPool points SID to {client: client} automatically from server-room upon a successful join, and whatever else you want.

If session is destroyed and client rejoins, be sure to store something else unique
about that player and point it to the {client, player,...} obj in ClientPool map, and then upon a new join request, the ID will be checked first to see if a previous session was there, and it will simply carry on from there, creating a new client, etc, but not new player info.
