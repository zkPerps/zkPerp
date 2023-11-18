import {Bool, Character, Field, Int64, method, Poseidon, Provable, SmartContract, state, State, UInt64} from 'o1js';


export class Perpetual extends SmartContract {
  @state (Field) position = State<Field>();
  @state (Field) closed = State<Bool>();
  @state (Field) pnl = State<Int64>();

  @method initState(
    salt: Field,
    type: Character, // 'l' - long, 's' - short
    collateral: UInt64,
    leverage: UInt64,
    openPrice: UInt64
  ) {
    this.position.set(Poseidon.hash([salt, type.value, collateral.value, leverage.value, openPrice.value]));
  }

  @method closePosition(
    closePrice: UInt64, // 6 decimals
    salt: Field,
    type: Character, // 'l' - long, 's' - short
    collateral: UInt64, // 6 decimals
    leverage: UInt64, // 6 decimals
    openPrice: UInt64 // 6 decimals
  ) {
    this.position.assertEquals(this.position.get());
    this.closed.assertEquals(this.closed.get());
    this.pnl.assertEquals(this.pnl.get());
    // const FALSE = Bool(false);
    this.closed.assertEquals(Bool(false));

    Poseidon.hash([salt, type.value, collateral.value, leverage.value, openPrice.value]).assertEquals(this.position.get());
    this.position.set(Poseidon.hash([salt, type.value, collateral.value, leverage.value, openPrice.value, closePrice.value]));

    const SCALING_FACTOR = Int64.from(1_000_000_000).toConstant(); // multiply precision factor
    const LEVERAGE_BASE = UInt64.from(1_000_000).toConstant(); // leverage input decimals
    //
    const leveraged_pos = collateral.mul(leverage).div(LEVERAGE_BASE);
    let pnl = Provable.if(
      closePrice.lessThanOrEqual(openPrice),
      SCALING_FACTOR.sub(Int64.fromUnsigned(closePrice).mul(SCALING_FACTOR).div(openPrice)),
      Int64.fromUnsigned(closePrice).mul(SCALING_FACTOR).div(openPrice).sub(SCALING_FACTOR)
    );
    //
    pnl = Provable.if(
      type.equals(Character.fromString('s')),
      pnl.neg(),
      pnl
    );
    //
    pnl = pnl.mul(leveraged_pos).div(SCALING_FACTOR);
    // this.closed.set(Bool(true));
    this.pnl.set(pnl);
  }
}
