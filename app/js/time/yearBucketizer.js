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

var yearBucketizer = yearBucketizer || function() {
    var startDate;
    var endDate;

    var setStartDate = function(newStartDate) {
        startDate = newStartDate;
    };

    var getStartDate = function() {
        return startDate;
    };

    var setEndDate = function(newEndDate) {
        endDate = newEndDate;
    };

    var getEndDate = function() {
        return endDate;
    };

    var zeroOutDate = function(date) {
        var zeroed = new Date(date);
        zeroed.setUTCMinutes(0);
        zeroed.setUTCSeconds(0);
        zeroed.setUTCMilliseconds(0);
        zeroed.setUTCHours(0);
        zeroed.setUTCDate(1);
        zeroed.setUTCMonth(0);
        return zeroed;
    };

    var getBucketIndex = function(date) {
        var yearsDifference = date.getUTCFullYear() - getStartDate().getUTCFullYear();
        return yearsDifference;
    };

    var getDateForBucket = function(bucketIndex) {
        var newYear = getStartDate().getUTCFullYear() + bucketIndex;
        var dateForBucket = zeroOutDate(getStartDate());
        dateForBucket.setUTCFullYear(newYear);
        return dateForBucket;
    };

    var getNumBuckets = function() {
        return getBucketIndex(getEndDate());
    };

    var roundUpBucket = function(date) {
        var rounded = zeroOutDate(date);
        // If the original date is after the zeroed out version, then go to the next bucket
        if(date > rounded) {
            rounded.setUTCFullYear(rounded.getUTCFullYear() + 1);
        }
        if(rounded > getEndDate()) {
            rounded = zeroOutDate(getEndDate());
        }
        return rounded;
    };

    var roundDownBucket = function(date) {
        var rounded = zeroOutDate(date);
        if(rounded < getStartDate()) {
            rounded = zeroOutDate(getStartDate());
        }
        return rounded;
    };

    var getDateFormat = function() {
        return "yyyy";
    };

    return {
        setStartDate: setStartDate,
        getStartDate: getStartDate,
        setEndDate: setEndDate,
        getEndDate: getEndDate,
        zeroOutDate: zeroOutDate,
        getBucketIndex: getBucketIndex,
        getDateForBucket: getDateForBucket,
        getNumBuckets: getNumBuckets,
        roundDownBucket: roundDownBucket,
        roundUpBucket: roundUpBucket,
        getDateFormat: getDateFormat
    };
};
