'use strict';
/*
 * Copyright 2015 Next Century Corporation
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

var dateBucketizer = dateBucketizer || function() {
    var DAY = "day";
    var HOUR = "hour";
    // Cache the number of milliseconds in an hour for processing.
    var MILLIS_IN_HOUR = 1000 * 60 * 60;
    var MILLIS_IN_DAY = MILLIS_IN_HOUR * 24;

    var startDate;
    var endDate;
    var granularity;
    var millisMultiplier;

    var setStartDate = function(date) {
        startDate = date;
    };

    var getStartDate = function() {
        return startDate;
    };

    var setEndDate = function(date) {
        endDate = date;
    };

    var getEndDate = function() {
        return endDate;
    };

    var setGranularity = function(newGranularity) {
        granularity = newGranularity;
        if(newGranularity === DAY) {
            millisMultiplier = MILLIS_IN_DAY;
        } else if(newGranularity === HOUR) {
            millisMultiplier = MILLIS_IN_HOUR;
        }
    };

    var getGranularity = function() {
        return granularity;
    };

    var getMillisMultiplier = function() {
        return millisMultiplier;
    };

    /**
     * Sets the minutes, seconds and millis to 0. If the granularity of the date is day,
     * then the hours are also zeroed
     * @param date
     * @returns {Date}
     */
    var zeroOutDate = function(date) {
        var zeroed = new Date(date);
        zeroed.setUTCMinutes(0);
        zeroed.setUTCSeconds(0);
        zeroed.setUTCMilliseconds(0);
        if(granularity === DAY) {
            zeroed.setUTCHours(0);
        }
        return zeroed;
    };

    /**
     * Calculates the bucket index for the date
     * @param {Date} date the date to get the index of
     * @return 0 if date is before or in the same bucket as the start date, or the number of
     * granularity intervals after the start date otherwise
     */
    var getBucketIndex = function(date) {
        var effectiveStartDate = zeroOutDate(getStartDate());
        var difference = date - effectiveStartDate;
        difference = (difference < 0) ? 0 : difference;
        return Math.floor(difference / millisMultiplier);
    };

    /**
     * Calculate the representative date for a particular bucket at the current granularity
     * @param {Number} bucketIndex
     * @return {Date} the date that represents the specified bucket (usually the start of
     * that bucket)
     */
    var getDateForBucket = function(bucketIndex) {
        var effectiveStartDate = zeroOutDate(getStartDate());
        var startDateInMs = effectiveStartDate.getTime();
        return new Date(startDateInMs + (millisMultiplier * bucketIndex));
    };

    /**
     * Calculate the number of intervals or buckets needed at the current granularity
     * @return {Number} the number of buckets
     */
    var getNumBuckets = function() {
        var effectiveStartDate = zeroOutDate(getStartDate());
        var effectiveEndDate = zeroOutDate(getEndDate());

        // TODO - The absolute value doesn't make sense here; we just don't want negative
        // values
        var difference = Math.abs(effectiveEndDate - effectiveStartDate);
        return Math.ceil(difference / millisMultiplier);
    };

    /**
     * Rounds the date up to the beginning of the next bucket, unless the date is already at
     * the start of the current bucket
     * @param date
     * @returns {Date}
     */
    var roundUpBucket = function(date) {
        var roundedDate = zeroOutDate(new Date(date.getTime() - 1 + millisMultiplier));
        if(roundedDate > getEndDate()) {
            return getEndDate();
        } else {
            return roundedDate;
        }
    };

    /**
     * Rounds the date down to the beginning of the current bucket
     * @param date
     * @returns {Date}
     */
    var roundDownBucket = function(date) {
        var roundedDate = zeroOutDate(new Date(date.getTime() + 1));
        if(roundedDate < getStartDate()) {
            return getStartDate();
        } else {
            return roundedDate;
        }
    };

    setGranularity(DAY);
    return {
        DAY: DAY,
        HOUR: HOUR,
        setStartDate: setStartDate,
        getStartDate: getStartDate,
        setEndDate: setEndDate,
        getEndDate: getEndDate,
        setGranularity: setGranularity,
        getGranularity: getGranularity,
        getMillisMultiplier: getMillisMultiplier,
        zeroOutDate: zeroOutDate,
        getBucketIndex: getBucketIndex,
        getDateForBucket: getDateForBucket,
        getNumBuckets: getNumBuckets,
        roundUpBucket: roundUpBucket,
        roundDownBucket: roundDownBucket
    };
};
