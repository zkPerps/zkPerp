
import { Perpetual } from './Perp.js';
import {
  Field,
  Mina,
  PrivateKey,
  AccountUpdate, Character, UInt64,
} from 'o1js';


const useProof = false;

const Local = Mina.LocalBlockchain({ proofsEnabled: useProof });
Mina.setActiveInstance(Local);
const { privateKey: deployerKey, publicKey: deployerAccount } =
  Local.testAccounts[0];
const { privateKey: senderKey, publicKey: senderAccount } =
  Local.testAccounts[1];

const salt = Field.random();

// ----------------------------------------------------

// create a destination we will deploy the smart contract to
const zkAppPrivateKey = PrivateKey.random();
const zkAppAddress = zkAppPrivateKey.toPublicKey();

const zkAppInstance = new Perpetual(zkAppAddress);
const deployTxn = await Mina.transaction(deployerAccount, () => {
  AccountUpdate.fundNewAccount(deployerAccount);
  zkAppInstance.deploy();
  zkAppInstance.initState(
    salt,
    Character.fromString('s'),
    UInt64.from(1_000_000),
    UInt64.from(1_000_000),
    UInt64.from(1_000_000).mul(2)
  );
});
await deployTxn.prove();
await deployTxn.sign([deployerKey, zkAppPrivateKey]).send();

// get the initial state of IncrementSecret after deployment
const pos = zkAppInstance.position.get();
console.log('state after init:', pos.toString());

// ----------------------------------------------------

const txn1 = await Mina.transaction(senderAccount, () => {
  zkAppInstance.closePosition(
      UInt64.from(1_000_000).mul(3),
      salt,
      Character.fromString('s'),
      UInt64.from(1_000_000),
      UInt64.from(1_000_000),
      UInt64.from(1_000_000).mul(2)
    );
});

console.log('123');
await txn1.prove();
await txn1.sign([senderKey]).send();

const closed = zkAppInstance.closed.get();
console.log('state after txn1:', closed.toString());