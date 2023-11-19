import {
  Bool,
  Character,
  Field,
  Int64,
  MerkleMapWitness,
  method,
  Poseidon,
  Provable,
  SmartContract,
  state,
  State,
  Struct,
  UInt32,
  UInt64
} from 'o1js';


export class Position extends Struct({
    salt: Field,
    type: Character, // 's' - short, 'l' - long
    collateral: UInt64, // 6 decimals
    leverage: UInt64, // 6 decimals
    openPrice: UInt64 // 6 decimals
    // createdAt: UInt32
  }) {
  hash() {
    return Poseidon.hash([
      this.salt, // for privacy
      this.type.value,
      this.collateral.value,
      this.leverage.value,
      this.openPrice.value
    ]);
  }

  closeHash(closePrice: UInt64): Field {
    return Poseidon.hash([
      this.salt, // for privacy
      this.type.value,
      this.collateral.value,
      this.leverage.value,
      this.openPrice.value,
      closePrice.value
    ]);
  }

  calcPnl(closePrice: UInt64): Int64 {
    const SCALING_FACTOR = Int64.from(1_000_000_000).toConstant(); // multiply precision factor
    const LEVERAGE_BASE = UInt64.from(1_000_000).toConstant(); // leverage input decimals

    const leveraged_pos = this.collateral.mul(this.leverage).div(LEVERAGE_BASE);
    let posPnl = Provable.if(
      closePrice.lessThanOrEqual(this.openPrice),
      SCALING_FACTOR.sub(Int64.fromUnsigned(closePrice).mul(SCALING_FACTOR).div(this.openPrice)),
      Int64.fromUnsigned(closePrice).mul(SCALING_FACTOR).div(this.openPrice).sub(SCALING_FACTOR)
    );
    posPnl = Provable.if(
      this.type.equals(Character.fromString('s')),
      posPnl.neg(),
      posPnl
    );
    return posPnl.mul(leveraged_pos).div(SCALING_FACTOR);
  }
}

export class Perpetual extends SmartContract {
  @state(Field) positionsMap = State<Field>();
  @state(UInt64) counter = State<UInt64>();
  @state(Int64) pnl = State<Int64>();

  @method initState(initialState: Field) {
    this.positionsMap.set(initialState);
    this.counter.set(UInt64.from(1));
    this.pnl.set(Int64.from(0));
  }

  private _getState(): [Field, UInt64, Int64] {
    const newPosKey = this.counter.get();
    this.counter.assertEquals(newPosKey);
    const root = this.positionsMap.get();
    this.positionsMap.assertEquals(root);
    const pnl = this.pnl.get();
    this.pnl.assertEquals(pnl);
    return [root, newPosKey, pnl];
  }

  // @dev Adds new position to positions merkle map using counter as key
  @method openPosition(
    keyWitness: MerkleMapWitness,
    position: Position
  ) {
    const [root, newPosKey,] = this._getState();

    // empty leafs have Field(0) as initial value
    const [rootBefore, key] = keyWitness.computeRootAndKey(Field(0));
    rootBefore.assertEquals(root);
    key.assertEquals(newPosKey.value);

    const [ rootAfter, ] = keyWitness.computeRootAndKey(position.hash());

    this.positionsMap.set(rootAfter);
    this.counter.set(newPosKey.add(1));
  }

  @method closePosition(
    keyWitness: MerkleMapWitness,
    posKey: Field,
    position: Position,
    closePrice: UInt64
  ) {
    let [root,, pnl] = this._getState();

    // empty leafs have Field(0) as initial value
    const [rootBefore, key] = keyWitness.computeRootAndKey(position.hash());
    rootBefore.assertEquals(root);
    key.assertEquals(posKey);

    const [ rootAfter, ] = keyWitness.computeRootAndKey(position.closeHash(closePrice));
    this.positionsMap.set(rootAfter);

    this.pnl.set(pnl.add(position.calcPnl(closePrice)));
  }
}
