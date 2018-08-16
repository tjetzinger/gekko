// helpers
var _ = require('lodash');
var log = require('../core/log.js');

// let's create our own method
var method = {};

// prepare everything our method needs
method.init = function() {
  this.name = 'RsiDivergence';

  this.digits = 8;

  this.stop = {
    stop: 2,
    threshold: 2,
    buy: false,
    buyValue: 0,
    stopValue: 0,
  };
  if (this.settings && this.settings.stoploss) {
    this.stop = Object.assign(this.stop, this.settings.stoploss);
  }

  this.requiredHistory = this.tradingAdvisor.historySize;
  this.rsiPriceHistory = [];

  // define the indicators we need
  this.addIndicator('rsi', 'RSI', this.settings);
  this.addIndicator('zTrailingStop', 'zTrailingStop', this.stop.threshold);
};

// for debugging purposes log the last
// calculated parameters.
method.log = function(candle) {
  // log.debug('calculated RSI properties for candle:');
  // log.debug('\t', 'rsi:', this.rsi.toFixed(this.digits));
  // log.debug('\t', 'price:', candle.close.toFixed(this.digits));
};

// what happens on every new candle?
method.update = function(candle) {
  this.rsi = this.indicators.rsi.result;

  if (this.rsi > 0) {
    this.rsiPriceHistory.push({ rsi:this.rsi, price:candle.close });
  }

  // remove oldest RSI & price values
  if (_.size(this.rsiPriceHistory) > this.requiredHistory){
    this.rsiPriceHistory.shift();
  }
};

method.isDivergenceLong = function(candle) {
  var trough = _.min(this.rsiPriceHistory, 'rsi');
  return this.rsi > trough.rsi && candle.close < trough.price;
};

method.isDivergenceShort = function(candle) {
  var peak = _.max(this.rsiPriceHistory, 'rsi');
  return this.rsi < peak.rsi && candle.close > peak.price;
};

method.check = function(candle) {
  if (_.size(this.rsiPriceHistory) < this.requiredHistory)
    return;


  if (this.rsi < this.settings.thresholds.low /*&& this.isDivergenceLong(candle)*/) {
    if (!this.stop.buy) {
      this.stop.buy = true;
      this.stop.buyValue = candle.close;
      this.stop.stopValue = this.stop.buyValue - (this.stop.buyValue * (this.stop.stop / 100));
      this.indicators.zTrailingStop.long(candle.close);
      return this.advice('long');
    }
  } else {
    if (this.stop.buy) {
      if (candle.close <= this.stop.stopValue) { //Venda atingiu o stop
        this.stop.buy = false;
        this.indicators.zTrailingStop.short(candle.close);
        return this.advice('short');
      } else if (this.indicators.zTrailingStop.shouldSell) {
        this.stop.buy = false;
        this.indicators.zTrailingStop.short(candle.close);
        return this.advice('short');
      }
    }
  }
  return this.advice();
};

module.exports = method;
