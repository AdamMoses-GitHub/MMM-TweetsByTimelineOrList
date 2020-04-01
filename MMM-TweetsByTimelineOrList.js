/* global Module */

/* MMM-TwitterTrendsByPlace.js
 * 
 * Magic Mirror
 * Module: MMM-TwitterTrendsByPlace
 * 
 * Magic Mirror By Michael Teeuw http://michaelteeuw.nl
 * MIT Licensed.
 * 
 * Module MMM-TwitterTrendsByPlace By Adam Moses http://adammoses.com
 */

Module.register("MMM-TweetsByTimelineOrList", {
    // setup the default config options
    defaults: {
        // required
        consumer_key: null,
        consumer_secret: null,
        access_token_key: null,
        access_token_secret: null,
        screenName: null,
        listToShow: 'TIMELINE', //SEARCH
        // optional
        tweetsToShowAtATime: 5,
        onScreenRefreshRate: 25 * 1000,
        tweetUpdateRefreshRate: 5 * 60 * 1000,
        moduleWidth: "300px",
        animationSpeed: 3 * 1000,
        showHeader: false,
        totalTweetsPerUpdate: 25,
        excludeTweetsWithQuotes: false,
        excludeRetweets: true,
        excludeMediaTweets: false,
        excludeLinkTweets: false,
        excludeTweetLengthLessThan: 16,
        excludeTweetsWithoutText: [],
        maxTweetsPerUser: 10,
        maxTweetAgeMins: 360,
        allowSpecialCharacters: false,
        displayColors: ['#888', '#aaa',],
        language: '', //leave empty and only use if requested
    },
    // the start function
    start: function () {
        // log starting
        Log.info("Starting module: " + this.name);
        // check refresh rate is not faster than 1 minute
        this.config.refreshRate = Math.max(60, this.config.tweetUpdateRefreshRate);
        // set loaded, error, and the update to init values
        this.loaded = false;
        this.errorMessage = null;
        this.tweetList = null;
        this.tweetIndex = null;
        this.config.identifier = this.identifier;
        this.updateTimer = null;
        // set the header to this place
        if (this.config.showHeader) {
            this.data.header = this.config.screenName + " - " + this.config.listToShow;
        }
        // if not missing required config fields start things up
        if ((this.config.consumer_key != null) && (this.config.consumer_secret != null)
            && (this.config.access_token_key != null) && (this.config.access_token_secret != null)
            && (this.config.screenName != null)) {
            // add this config to the helper functions
            this.sendSocketNotification('TWEETS_REGISTER_CONFIG', this.config);
        }
        // otherwise set error message
        else {
            this.error = "Required config missing.";
        }
    },
    // the socket handler
    socketNotificationReceived: function (notification, payload) {
        // if an update was received
        if (notification === "TWEETS_UPDATE") {
            // check this is for this module based on the woeid
            if (payload.identifier === this.identifier) {
                // set loaded flag, set the update, and call update dom                
                this.tweetList = payload.tweetList;
                this.tweetIndex = 0;
                if (!this.loaded) {
                    this.loaded = true;
                    this.updateDom(this.config.animationSpeed);
                    var self = this;
                    this.updateTimer = setInterval(
                        function () { self.updateDom(self.config.animationSpeed); },
                        this.config.onScreenRefreshRate);
                }
            }
        }
        // if sent error notice
        if (notification === "TWEETS_TOO_MANY_ERRORS") {
            this.errorMessage = "There was an error.";
            if (this.updateTimer !== null)
                clearTimeout(this.updateTimer);
            this.updateTimer = null;
            this.updateDom();
        }
    },
    // gathers the current set of tweets from the full list to display
    getTweetsToShow: function () {
        console.log("Tweetslistlength: " + this.tweetList.length);
        if (this.tweetList.length <= this.config.tweetsToShowAtATime)
            return this.tweetList;
        var indexStart = this.tweetIndex % this.tweetList.length;
        var indexEnd = indexStart + this.config.tweetsToShowAtATime - 1;
        var returnTweets = [];
        if (indexEnd < this.tweetList.length) {
            returnTweets = this.tweetList.slice(indexStart, indexEnd + 1);
        }
        else {
            returnTweets = this.tweetList.slice(indexStart, this.tweetList.length);
            var tweetsRemaining = this.config.tweetsToShowAtATime - returnTweets.length;
            returnTweets = returnTweets.concat(this.tweetList.slice(0, tweetsRemaining));
        }
        this.tweetIndex += this.config.tweetsToShowAtATime;
        return returnTweets;
    },
    // get the age of the tweet for display
    getStringTimeDifference: function (theTimestamp) {
        var nowTime = Date.now();
        var thenTime = Date.parse(theTimestamp);
        var calcTime = nowTime - thenTime;
        var diffSecs = Math.round(calcTime / 1000);
        if (diffSecs < 60) {
            return diffSecs + "s";
        }
        if (diffSecs < (60 * 60)) {
            var diffMins = Math.round(diffSecs / 60);
            return diffMins + "m";
        }
        var diffHours = Math.round(diffSecs / (60 * 60));
        return diffHours + "h";
    },
    // the get dom handler
    getDom: function () {
        // if an error, say so
        if (this.errorMessage !== null) {
            var wrapper = document.createElement("div");
            wrapper.className = "small";
            wrapper.innerHTML = this.errorMessage;
            return wrapper;
        }
        // if nothing loaded yet, put in placeholder text
        if (!this.loaded) {
            var wrapper = document.createElement("div");
            wrapper.className = "small";
            wrapper.innerHTML = "Awaiting Update...";
            return wrapper;
        }
        var wrapper = document.createElement("table");
        var currentDisplayTweets = this.getTweetsToShow();

        console.log(this.name + " #### display.length " + currentDisplayTweets.length);
        for (var cIndex = 0; cIndex < currentDisplayTweets.length; cIndex++) {
            var tweet = currentDisplayTweets[cIndex];
            var colorValue = "color:" +
                this.config.displayColors[cIndex % this.config.displayColors.length];
            var tweetTR = document.createElement("tr");
            var tweetTD = document.createElement("td");
            tweetTD.align = "right";
            tweetTD.className = "xsmall";
            tweetTD.style = colorValue;
            tweetTD.width = this.config.moduleWidth;
            tweetTD.innerHTML = tweet.name + ' - ' + this.getStringTimeDifference(tweet.timestamp);
            tweetTR.appendChild(tweetTD);
            var usertimeTR = document.createElement("tr");
            var usertimeTD = document.createElement("td");
            usertimeTD.align = "left";
            usertimeTD.className = "small";
            usertimeTD.style = colorValue;
            usertimeTD.width = this.config.moduleWidth;
            usertimeTD.innerHTML = tweet.text;
            usertimeTR.appendChild(usertimeTD);
            wrapper.appendChild(usertimeTR);
            wrapper.appendChild(tweetTR);
        }
        return wrapper;
    }
});

// ------------ end -------------
