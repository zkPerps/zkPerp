
import { Perpetual, Position } from './Perp.js';
import {
  Field,
  Mina,
  PrivateKey,
  AccountUpdate, Character, UInt64, Bool, MerkleMap,
} from 'o1js';


const useProof = false;

const Local = Mina.LocalBlockchain({ proofsEnabled: useProof });
Mina.setActiveInstance(Local);
const { privateKey: deployerKey, publicKey: deployerAccount } =
  Local.testAccounts[0];
const { privateKey: senderKey, publicKey: senderAccount } =
  Local.testAccounts[1];

// ----------------------------------------------------

// create a destination we will deploy the smart contract to
const zkAppPrivateKey = PrivateKey.random();
const zkAppAddress = zkAppPrivateKey.toPublicKey();


const map = new MerkleMap();


// --------------------------- DEPLOY --------------------------------
const zkAppInstance = new Perpetual(zkAppAddress);
const deployTxn = await Mina.transaction(deployerAccount, () => {
  AccountUpdate.fundNewAccount(deployerAccount);
  zkAppInstance.deploy();
  zkAppInstance.initState(map.getRoot());
});
await deployTxn.prove();
await deployTxn.sign([deployerKey, zkAppPrivateKey]).send();

// get the initial state of IncrementSecret after deployment
const pos_map = zkAppInstance.positionsMap.get();
const counter = zkAppInstance.counter.get();
console.log('state after init:', pos_map.toString(), counter.toString());

// --------------------------- OPEN POSITION -------------------------------------
const salt = Field.random();
const value = new Position({
  salt: salt,
  type: Character.fromString('l'), // long
  collateral: UInt64.from(10_000_000), // 10$
  leverage: UInt64.from(2_000_000), // 2x
  openPrice: UInt64.from(30_000_000), // 30k$
  // createdAt: UInt32
});

const pos_key = counter.value;
map.set(pos_key, value.hash());

const txn1 = await Mina.transaction(senderAccount, () => {
  zkAppInstance.openPosition(
    map.getWitness(pos_key),
    value
  );
});

await txn1.prove();
await txn1.sign([senderKey]).send();

const state_new = zkAppInstance.positionsMap.get();
const new_counter = zkAppInstance.counter.get();
console.log('state after txn1:', state_new.toString(), new_counter.toString());
console.log('local map root', map.getRoot().toString())

// --------------------------- CLOSE POSITION -------------------------------------
const closePrice = UInt64.from(32_000_000);
map.set(pos_key, value.closeHash(closePrice));
const txn2 = await Mina.transaction(senderAccount, () => {
  zkAppInstance.closePosition(
    map.getWitness(pos_key),
    pos_key,
    value,
    closePrice
  );
});

await txn2.prove();
await txn2.sign([senderKey]).send();

const state_final = zkAppInstance.positionsMap.get();
const counter_final = zkAppInstance.counter.get();
const pnl = zkAppInstance.pnl.get();
console.log('state after txn2:', state_final.toString(), counter_final.toString());
console.log('local map root', map.getRoot().toString())
console.log('pnl', pnl.toString())

