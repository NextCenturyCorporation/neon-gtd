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

function MonthBucketizer() {
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
        return zeroed;
    };

    var getBucketIndex = function(date, fallbackStartDate) {
        var effectiveStartDate = zeroOutDate(getStartDate() || fallbackStartDate);

        var yearsDifference = date.getUTCFullYear() - effectiveStartDate.getUTCFullYear();
        var monthsDifference = date.getUTCMonth() - effectiveStartDate.getUTCMonth();
        return yearsDifference * 12 + monthsDifference;
    };

    var getDateForBucket = function(bucketIndex, fallbackStartDate) {
        var effectiveStartDate = zeroOutDate(getStartDate() || fallbackStartDate);

        var newMonth = effectiveStartDate.getUTCMonth() + bucketIndex;
        var dateForBucket = zeroOutDate(effectiveStartDate);
        // This will properly wrap to different years
        dateForBucket.setUTCMonth(newMonth);
        return dateForBucket;
    };

    var getNumBuckets = function(fallbackStartDate, fallbackEndDate) {
        // The number of buckets is really just the bucket index of the end date
        var effectiveEndDate = getEndDate() || fallbackEndDate;
        return getBucketIndex(effectiveEndDate, fallbackStartDate);
    };

    var roundUpBucket = function(date) {
        var rounded = zeroOutDate(date)
        // If the original date is after the zeroed out version, then go to the next bucket
        if (date > rounded) {
            rounded.setUTCMonth(rounded.getUTCMonth()+1);
        }
        if (rounded > getEndDate()) {
            rounded = zeroOutDate(getEndDate());
        }
        return rounded;
    };

    var roundDownBucket = function(date) {
        var rounded = zeroOutDate(date);
        if (rounded < getStartDate()) {
            rounded = zeroOutDate(getStartDate());
        }
        return rounded;
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
        roundUpBucket: roundUpBucket,
        roundDownBucket: roundDownBucket
    };
};
