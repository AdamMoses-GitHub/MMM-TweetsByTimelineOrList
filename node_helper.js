/* global Module */

/* node_helper.js
 * 
 * Magic Mirror
 * Module: MMM-TwitterTrendsByPlace
 * 
 * Magic Mirror By Michael Teeuw http://michaelteeuw.nl
 * MIT Licensed.
 * 
 * Module MMM-TwitterTrendsByPlace By Adam Moses http://adammoses.com
 */

// call in the required classes
var NodeHelper = require("node_helper");
var Twitter = require("twitter");
// the main module helper create
module.exports = NodeHelper.create({
    // subclass start method, clears the initial config array
    start: function() {
        this.moduleConfigs = [];
        this.timers = [];
        this.errorCount = 0;
        // this value controls number of REST call fails before giving up
        this.errorFailLimit = 10;
    },
    // subclass socketNotificationReceived, received notification from module
    socketNotificationReceived: function(notification, payload) {
        if (notification === "TWEETS_REGISTER_CONFIG") {              
            // add the current config to an array of all configs used by the helper
            this.moduleConfigs[this.moduleConfigs.length] = payload;
            // this to self
            var self = this;     
            // call the initial update now
            this.updateTweets(payload);
            // schedule the updates
            this.timers[this.timers.length] = setInterval(
                function() { self.updateTweets(payload); }, payload.tweetUpdateRefreshRate);
        }
    },
    // increment error count, if passed limit send notice to module and stop updates
    processError: function() {
        this.errorCount += 1;
        if (this.errorCount >= this.errorFailLimit)
        {
            this.sendSocketNotification('TWEETS_TOO_MANY_ERRORS', {} );
            for (var cIndex = 0; cIndex < this.timers.length; cIndex++)
                clearTimeout(this.timers[cIndex]);
            this.timers = [];
        }
    },    
    // return clean tweet text / name
    // removes all urls, newlines, eol :'s, and multi-spaces
    cleanString: function(theString, theConfig) {
        var cTextClean = theString;
        cTextClean = cTextClean.replace(/(?:https?|ftp):\/\/[\n\S]+/g, '');          
        if (!theConfig.allowSpecialCharacters)
			cTextClean = cTextClean.replace(/[^\x00-\x7F]/g, '');
        cTextClean = cTextClean.replace(/\n/g, ' ');
        cTextClean = cTextClean.replace(/\s+/g, ' ');
        cTextClean = cTextClean.trim();
        if (cTextClean.endsWith(':'))
            cTextClean = cTextClean.substr(0, cTextClean.length - 1);
        return cTextClean;
    },
    // checks that a given tweet's text has the config text match met
    // uses the excludeTweetsWithoutText config array option
    doesNotHaveRequiredText: function(theText, theConfig) {
    	var theTextL = theText.toLowerCase();
    	var excludeTweetsWithoutText = theConfig.excludeTweetsWithoutText;
    	for (cIndex = 0; cIndex < excludeTweetsWithoutText.length; cIndex++) {
    		var cTextMatch = excludeTweetsWithoutText[cIndex].toLowerCase();
    		if (theTextL.indexOf(cTextMatch) > -1)
    			return false;
    	}
    	return true;
    },
    // parses the received tweets and send back to module
    parseTweets: function(theConfig, tweets) {
          var includedTweetList = [ ];          
          var userTweetCountList = {};
          var nowTime = Date.now();
          for (var cIndex = 0; cIndex < tweets.length; cIndex++)
          {
              // break out all the tweet components
              var cTweet = tweets[cIndex];
              var cText = this.cleanString(cTweet.text, theConfig);
              var cTimestamp = cTweet.created_at;
              var cTweetAgeMins = Math.round((nowTime - Date.parse(cTimestamp)) / (1000 * 60));
              var cUserFullName = this.cleanString(cTweet.user.name, theConfig);
              var cUserScreenName = cTweet.user.screen_name;
              var cIsQuoteStatus = cTweet.is_quote_status;
              var cIsRetweeted = (cTweet.retweeted_status !== undefined);
              var cHasMedia = (cTweet.entities.media !== undefined);
              var cHasURLs = (cTweet.entities.urls.length !== 0);
              if (userTweetCountList[cUserScreenName] === undefined)
                    userTweetCountList[cUserScreenName] = { count: 1 };                     
                else
                    userTweetCountList[cUserScreenName].count += 1;                          
              var cUserTweetCount = userTweetCountList[cUserScreenName].count;
               // set flag to assume inclusion of this tweet
              var doInclude = true;
              // if set to exclude quote and has a quote, exclude
              if (theConfig.excludeTweetsWithQuotes && cIsQuoteStatus) 
                  doInclude = false;
              // if set to exclude retweets and is a retweet, exclude
              if (theConfig.excludeRetweets && cIsRetweeted)
                  doInclude = false;
              // if set to exclude tweets with media has media, exclude
              if (theConfig.excludeMediaTweets && cHasMedia)
                  doInclude = false;
              // if set to exclude tweets with links and has a link, exclude
              if (theConfig.excludeLinkTweets && cHasURLs)
                  doInclude = false;
              // if set to exclude short tweets and is short, exclude
              if ( (theConfig.excludeTweetLengthLessThan > 0) && 
                    (cText.length < theConfig.excludeTweetLengthLessThan) )
                    doInclude = false;
              // if set to limit tweets per user check if exceeds that amount, exclude
              if ( (theConfig.maxTweetsPerUser > 0) && 
                    (cUserTweetCount > theConfig.maxTweetsPerUser) )
                    doInclude = false;
              // if set to tweet age is set and greater than that, exclude
              if ( (theConfig.maxTweetAgeMins > 0) && 
                    (cTweetAgeMins > theConfig.maxTweetAgeMins) )
                    doInclude = false;
              // if set to check for certain text matches, exclude those that don't
              if ( (theConfig.excludeTweetsWithoutText.length > 0) &&
            		  (this.doesNotHaveRequiredText(cText, theConfig)) )
            	  	doInclude = false;
              // if not included for some reason, include it
              if (doInclude)
              {
                  // build tweet info for module
                var cTweetInfo = { 
                    text: cText,
                    screen_name: cUserScreenName,                                
                    name: cUserFullName,  
                    timestamp: cTimestamp,  
                    index: includedTweetList.length,
                };  
                // add tweet to the list
                includedTweetList[includedTweetList.length] = cTweetInfo;
              }                                                 
          }  
          // build payload, identified and tweet list
          var returnPayload = { identifier: theConfig.identifier,
                                tweetList: includedTweetList};
          // send payload to module
          this.sendSocketNotification('TWEETS_UPDATE', returnPayload);
    },
    // main helper function to get the trends
    updateTweets: function(theConfig) { 
        var client = new Twitter({
          consumer_key: theConfig.consumer_key,
          consumer_secret: theConfig.consumer_secret,
          access_token_key: theConfig.access_token_key,
          access_token_secret: theConfig.access_token_secret
        });  
        // this to self
        var self = this;
        // prepare the twitter client param, clear query and params
        var query = '';
        var params = { };
        // if no list name or timeline, set for timeline get
        if ((theConfig.listToShow === '') 
                || (theConfig.listToShow.toUpperCase() === 'TIMELINE')) {
            query = 'statuses/home_timeline';
            params = { count: theConfig.totalTweetsPerUpdate, 
                screen_name: theConfig.screenName,
                exclude_replies: true, include_rts: false };
        }
        // otherwise get a named list
        else {
            query = 'lists/statuses';
            params = { count: theConfig.totalTweetsPerUpdate, exclude_replies: true, include_rts: false, 
                slug: theConfig.listToShow, owner_screen_name: theConfig.screenName };  
        }
        // call twitter client based on query and params
        client.get(query, params, function(error, tweets, response) {
            // if no error, send tweets for processing
            if (!error) {
                self.parseTweets(theConfig, tweets);
            }
            // otherwise process error
            else {
                self.processError();
            }
        });  
    },      
});

//------------ end -------------
