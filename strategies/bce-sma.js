// helpers
var _ = require('lodash');
var util = require('../core/util.js');
var log = require('../core/log.js');
var SMA = require('./indicators/SMA.js');
var config = util.getConfig();

const CandleBatcher = require('../core/candleBatcher');

// let's create our own method
var method = {};

// prepare everything our method needs
method.init = function() {
  // since we're relying on batching 1 minute candles into 15 and 30 minute candles
  // lets throw if the settings are wrong
  if (config.tradingAdvisor.candleSize !== 1) {
    throw "This strategy must run with candleSize=1";
  }

  this.sma60 = new SMA(200);

  // 30 x 1 minute candle
  this.batcher5 = new CandleBatcher(30);
  this.batcher5.on('candle', this.update5);
  // 2 x 30 minute candle
  this.batcher60 = new CandleBatcher(2);
  this.batcher60.on('candle', this.update60);

  this.holding = false;
};

// what happens on every new candle?
method.update = function(candle) {
  this.shouldSell = false;
  this.shouldBuy = false;

  this.batcher5.write([candle]);
  this.batcher5.flush();
};

method.update5 = function(candle) {
  this.shouldBuy = candle.close > this.sma60.result;
  this.shouldSell = candle.close < this.sma60.result;

  this.batcher60.write([candle]);
  this.batcher60.flush();
};

method.update60 = function(candle) {
  this.sma60.update(candle.close)
};

method.check = function(candle) {
  if(this.holding && this.shouldSell) {
    this.holding = false;
    this.advice('short');
  }
  if(!this.holding && this.shouldBuy) {
    this.holding = true;
    this.advice('long');
  }
};

module.exports = method;
