// skeleton example of strategy that operates on multiple timeframes
//
// this is not intended to be an example of a clever or profitable trading strategy!
//
// zappra  28/03/18

var log = require('../core/log');
var util = require('../core/util.js');
var config = util.getConfig();

const CandleBatcher = require('../core/candleBatcher');
var RSI = require('../strategies/indicators/RSI.js');

/////////////////////////////////////////////////////////////////////
var strat = {};

/////////////////////////////////////////////////////////////////////
strat.init = function() {

  // since we're relying on batching 1 minute candles into 15 and 30 minute candles
  // lets throw if the settings are wrong
  if (config.tradingAdvisor.candleSize !== 1) {
    throw "This strategy must run with candleSize=1";
  }

  // create candle batchers for 15 and 30 minute candles
  // 5 x 1 minute candle
  this.batcher5 = new CandleBatcher(5);
  // 3 x 5 minute candle
  this.batcher15 = new CandleBatcher(3);

  // supply callbacks for 15 and 30 minute candle functions
  this.batcher5.on('candle', this.update5);
  this.batcher15.on('candle', this.update15);

  // indicators
  var rsiParams = {
    interval: this.settings.interval,
  };

  // gekko will be running on 1 minute timeline internally
  // so we create and maintain indicators manually in order to update them at correct time
  // rather than using this.addIndicator
  this.rsi1 = new RSI(rsiParams);
  this.lastResult1 = -1;
  this.rsi5 = new RSI(rsiParams);
  this.lastResult5 = -1;
  this.rsi15 = new RSI(rsiParams);
  this.lastResult15 = -1;

  // set some initial state
  this.hodling = false;
}

/////////////////////////////////////////////////////////////////////
strat.update = function(candle) {
  // reset the buy/sell flags before updating
  this.shouldBuy = false;
  this.shouldSell = false;

  // do 1 minute processing
  this.lastPrice = candle.close;
  this.rsi1.update(candle);

  // update stop and take profit, if applicable
  // if (this.hodling) {
  //   if (candle.close < this.stop) {
  //     this.shouldSell = true;
  //   }
  //   else if (candle.close > this.takeProfit) {
  //     this.shouldSell = true;
  //   }
  // }

  // write 1 minute candle to 5 minute batcher
  this.batcher5.write([candle]);
  this.batcher5.flush();
}

/////////////////////////////////////////////////////////////////////
strat.update5 = function(candle) {
  // do 5 minute processing
  this.rsi5.update(candle);

  // we sell on bearish crossover of high divergence threshold on 15 minute MACD
  // in the unlikely event that stop loss/take profit didn't trigger
  var result = this.rsi5.result;
  var cross = this.settings.thresholds.high;
  if (this.lastResult5 != -1 && this.hodling && result < cross && this.lastResult5 >= cross) {
    this.shouldSell = true;
  }
  this.lastResult5 = result;

  // write 5 minute candle to 15 minute batcher
  this.batcher15.write([candle]);
  this.batcher15.flush();
}

/////////////////////////////////////////////////////////////////////
strat.update15 = function(candle) {
  // do 15 minute processing
  this.rsi15.update(candle);

  // we buy on bullish crossover of low divergence threshold on 15 minute MACD
  var result = this.rsi15.result;
  var cross = this.settings.thresholds.low;
  log.info(result, cross, this.lastResult15)
  if (this.lastResult15 != -1 && !this.hodling && result >= cross && this.lastResult15 < cross) {
    this.shouldBuy = true;
  }
  this.lastResult15 = result;
}

//////////////////////////////////////////////////////////////////////
strat.check = function() {

  // check for flags set in update functions, and buy/sell accordingly
  if (!this.hodling && this.shouldBuy) {
    // buy!
    this.advice('long');
    this.hodling = true;
  }
  else if (this.hodling && this.shouldSell) {
    // sell!
    this.advice('short');
    this.hodling = false;
  }
}

module.exports = strat;
