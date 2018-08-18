// https://www.youtube.com/watch?v=zhEukjCzXwM

var _ = require('lodash');
var log = require('../core/log');
var util = require('../core/util.js');
var config = util.getConfig();

const CandleBatcher = require('../core/candleBatcher');
var EMA = require('../strategies/indicators/EMA.js');

/////////////////////////////////////////////////////////////////////
var strat = {};

/////////////////////////////////////////////////////////////////////
strat.init = function() {

  log.debug('Initialising EMA scalping strategy on 5m timeframe');

  // since we're relying on batching 1 minute candles into 15 and 30 minute candles
  // lets throw if the settings are wrong
  if (config.tradingAdvisor.candleSize !== 1) {
    throw "This strategy must run with candleSize=1";
  }

  // create candle batchers for 15 and 60 minute candles
  // 5 x 1 minute candle
  this.batcher5 = new CandleBatcher(5);
  // 12 x 5 minute candle
  this.batcher60 = new CandleBatcher(12);

  // supply callbacks for 15 and 30 minute candle functions
  this.batcher5.on('candle', this.update5);
  this.batcher60.on('candle', this.update60);

  // gekko will be running on 1 minute timeline internally
  // so we create and maintain indicators manually in order to update them at correct time
  // rather than using this.addIndicator
  this.ema51 = new EMA(this.settings.ema51);
  this.ema52 = new EMA(this.settings.ema52);
  this.ema53 = new EMA(this.settings.ema53);
  this.ema601 = new EMA(this.settings.ema601);
  this.ema602 = new EMA(this.settings.ema602);

  // set some initial state
  this.digits = 2;
  this.trend = {
    direction: 'none',
    duration: 0,
    persisted: false,
  };
  this.trade = {
    adviced: false,
    entryPrice: false,
    stopLoss: false,
    takeProfit: false
  };
  this.candleHistory5 = 5;
  this.candleHistory60 = 3;
  this.candles5 = [];
  this.candles60 = [];
}

/////////////////////////////////////////////////////////////////////
strat.update = function(candle) {
  // reset the buy/sell flags before updating
  this.shouldBuy = false;
  this.shouldSell = false;

  // do 1 minute processing
  this.lastPrice = candle.close;

  if(!this.trade.adviced && this.trade.entryPrice) {
    if(this.trend.direction === 'up'){
      if(this.lastPrice >= this.trade.entryPrice) {
        this.shouldBuy = true;
      }
    }
    else if(this.trend.direction === 'down') {
      if(this.lastPrice <= this.trade.entryPrice) {
        //this.shouldSell = true;
      }
    }
  }
  else if(this.trade.adviced && this.trade.stopLoss && this.trade.takeProfit) {
    if(this.trend.direction === 'up'){
      if(this.lastPrice >= this.trade.takeProfit || this.lastPrice < this.trade.stopLoss) {
        this.shouldSell = true;
      }
    }
    else if(this.trend.direction === 'down') {
      if(this.lastPrice <= this.trade.takeProfit || this.lastPrice > this.trade.stopLoss) {
        //this.shouldBuy = true;
      }
    }
  }

  // write 1 minute candle to 5 minute batcher
  this.batcher5.write([candle]);
  this.batcher5.flush();
}

/////////////////////////////////////////////////////////////////////
strat.update5 = function(candle) {
  // do 5 minute processing
  this.ema51.update(candle.close);
  this.ema52.update(candle.close);
  this.ema53.update(candle.close);

  // add latest candle
  this.candles5.push(candle);
  // remove oldest candle
  if (_.size(this.candles5) > this.candleHistory5)
    this.candles5 = _.rest(this.candles5);

  var margin, takeProfit;
  if(!this.trade.adviced && this.trend.persisted && this.trend.direction === 'up') {
    if(this.ema51.result > candle.high && this.ema52.result < candle.high) {
      var high = _.max(this.candles5, 'high').high;
      margin = (high / candle.low - 1) * 100;
      takeProfit = (high * (margin / 100 + 1)).toFixed(this.digits);
      if (margin >= 1){
        this.trade.entryPrice = high.toFixed(this.digits);
        this.trade.stopLoss = candle.low.toFixed(this.digits);
        this.trade.takeProfit = takeProfit;
      }
    }
    else if(this.ema52.result >= candle.high) {
      this.trade.entryPrice = false;
      this.trade.stopLoss = false;
      this.trade.takeProfit = false;
    }
  }
  else if(!this.trade.adviced && this.trend.persisted && this.trend.direction === 'down') {
    if(this.ema51.result < candle.high && this.ema52.result > candle.high) {
      var low = _.min(this.candles5, 'low').low;
      margin = (candle.high / low - 1) * 100;
      takeProfit = (low * (-1 * margin / 100 + 1)).toFixed(this.digits);

      if(margin >= 1) {
        this.trade.entryPrice = low.toFixed(this.digits);
        this.trade.stopLoss = candle.high.toFixed(this.digits);
        this.trade.takeProfit = takeProfit;
      }
    }
    else if(this.ema52.result <= candle.low) {
      this.trade.entryPrice = false;
      this.trade.stopLoss = false;
      this.trade.takeProfit = false;
    }
  }

  // write 5 minute candle to 60 minute batcher
  this.batcher60.write([candle]);
  this.batcher60.flush();
}

/////////////////////////////////////////////////////////////////////
strat.update60 = function(candle) {
  // do 60 minute processing
  this.ema601.update(candle.close);
  this.ema602.update(candle.close);

  // add latest candle
  this.candles60.push(candle);
  // remove oldest candle
  if (_.size(this.candles60) > this.candleHistory60)
    this.candles60 = _.rest(this.candles60);

  if(this.ema601.result < this.ema602.result && this.ema601.result >= candle.high){
    this.trend.direction = 'down';
    this.trend.duration++;
    if(this.trend.duration >= this.settings.persistence)
      this.trend.persisted = true;
  }
  else if(this.ema601.result > this.ema602.result && this.ema601.result <= candle.low) {
    this.trend.direction = 'up';
    this.trend.duration++;
    if(this.trend.duration >= this.settings.persistence)
      this.trend.persisted = true;
  }
  else {
    this.trend.direction = 'none';
    this.trend.duration = 0;
    this.trend.persisted = false;
  }
}

//////////////////////////////////////////////////////////////////////
strat.check = function() {
  if(this.shouldBuy) {
    this.advice('long');
    this.trade.adviced = true;
  }
  else if(this.shouldSell) {
    this.advice('short');
    this.trade = {
      adviced: false,
      entryPrice: false,
      stopLoss: false,
      takeProfit: false
    };
  }
}

module.exports = strat;
