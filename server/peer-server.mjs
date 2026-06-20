import { PeerServer } from 'peer';

PeerServer({ port: 9001, path: '/peerjs' });
console.log('PeerServer running on port 9001');
