'use strict';

describe("monthBucketizer", function() {
    var bucketizer;

    beforeEach(function() {
        bucketizer = monthBucketizer();
    });

    it("initial values are correct", function() {
        expect(bucketizer.getStartDate()).toBe(undefined);
        expect(bucketizer.getEndDate()).toBe(undefined);
    });

    it("setters and getters for start and end dates work", function() {
        var past = new Date(1980, 1, 2, 3, 4, 5);
        var future = new Date(2050, 5, 4, 3, 2, 1);
        bucketizer.setStartDate(past);
        bucketizer.setEndDate(future);
        expect(bucketizer.getStartDate()).toBe(past);
        expect(bucketizer.getEndDate()).toBe(future);
    });

    it("zero out month", function() {
        var originalDay = new Date(Date.UTC(1980, 1, 2, 3, 4, 5));
        var zeroDay = bucketizer.zeroOutDate(originalDay);
        expect(zeroDay.getUTCFullYear()).toBe(originalDay.getUTCFullYear());
        expect(zeroDay.getUTCMonth()).toBe(originalDay.getUTCMonth());
        expect(zeroDay.getUTCDate()).toBe(1);
        expect(zeroDay.getUTCHours()).toBe(0);
        expect(zeroDay.getUTCMinutes()).toBe(0);
        expect(zeroDay.getUTCSeconds()).toBe(0);
        expect(zeroDay.getUTCMilliseconds()).toBe(0);
    });

    it("zero out is idempotent", function() {
        var originalDate = new Date(1980, 1, 2, 3, 4, 5);
        var zeroDate = bucketizer.zeroOutDate(originalDate);
        var doubleZeroDate = bucketizer.zeroOutDate(zeroDate);
        expect(doubleZeroDate.toUTCString()).toBe(zeroDate.toUTCString());
    });

    it("bucket index of start date is 0", function() {
        var startDate = new Date(Date.UTC(1980, 1, 2, 3, 4, 5));
        bucketizer.setStartDate(startDate);
        expect(bucketizer.getBucketIndex(startDate)).toBe(0);
    });

    it("bucket index of later that month is 0", function() {
        var startDate = new Date(Date.UTC(1980, 1, 2, 3, 4, 5));
        bucketizer.setStartDate(startDate);
        var laterThatMonth = new Date(startDate);
        laterThatMonth.setUTCDate(28);
        expect(bucketizer.getBucketIndex(laterThatMonth)).toBe(0);
    });

    it("bucket index of the next month is 1", function() {
        var startDate = new Date(Date.UTC(1980, 1, 2, 3, 4, 5));
        bucketizer.setStartDate(startDate);
        var nextMonth = new Date(Date.UTC(1980, 2, 1));
        expect(bucketizer.getBucketIndex(nextMonth)).toBe(1);
    });

    it("bucket index of the next year is 12", function() {
        var startDate = new Date(Date.UTC(1980, 1, 2, 3, 4, 5));
        bucketizer.setStartDate(startDate);
        var nextYear = new Date(Date.UTC(1981, 1, 1));
        expect(bucketizer.getBucketIndex(nextYear)).toBe(12);
    });

    it("bucket index uses fallback date if none is set", function() {
        var startDate = new Date(Date.UTC(1980, 1, 2, 3, 4, 5));
        // No start date, so the second argument is the fallback
        expect(bucketizer.getBucketIndex(startDate, startDate)).toBe(0);
    });

    it("getDateForBucket() returns a zeroed out date that matches that bucket", function() {
        var startDate = new Date(Date.UTC(1980, 1, 2, 3, 4, 5));
        var dateIndex = 1;
        bucketizer.setStartDate(startDate);
        var nextDate = bucketizer.getDateForBucket(dateIndex);
        // The representative date should be a zeroed out day
        var zeroNextDay = bucketizer.zeroOutDate(nextDate);
        expect(nextDate.toUTCString()).toBe(zeroNextDay.toUTCString());
        // And the index of the date should be the index we passed in
        expect(bucketizer.getBucketIndex(nextDate)).toBe(dateIndex);
    });

    it("getDateForBucket() wraps around years properly", function() {
        var startDate = new Date(Date.UTC(1980, 1, 2, 3, 4, 5));
        var dateIndex = 13;
        bucketizer.setStartDate(startDate);
        var nextDate = bucketizer.getDateForBucket(dateIndex);
        // The year and month are correct
        expect(nextDate.getUTCFullYear()).toBe(1981);
        expect(nextDate.getUTCMonth()).toBe(2);
    });

    it("getDateForBucket() uses fallback date if none is set", function() {
        var startDate = new Date(Date.UTC(1980, 1, 2, 3, 4, 5));
        // No start date, so the second argument is the fallback
        var bucketDate = bucketizer.getDateForBucket(0, startDate);
        expect(bucketDate.toUTCString()).toBe(bucketizer.zeroOutDate(startDate).toUTCString());
    });

    it("get num buckets for zero length", function() {
        var startDate = new Date(Date.UTC(1980, 1, 2, 3, 4, 5));
        bucketizer.setStartDate(startDate);
        bucketizer.setEndDate(startDate);
        // All data is expected to be before the zeroed out end date, so if the end date is the same
        // as the start date, then there can't be any data.
        expect(bucketizer.getNumBuckets()).toBe(0);
    });

    it("get num buckets for next month", function() {
        var startDate = new Date(Date.UTC(1980, 1, 2, 3, 4, 5));
        var nextMonth = new Date(Date.UTC(1980, 2, 1, 0, 0, 0));
        bucketizer.setStartDate(startDate);
        bucketizer.setEndDate(nextMonth);
        // So long as the end date is on the following UTC day, there will be 1 bucket
        expect(bucketizer.getNumBuckets()).toBe(1);
    });

    it("get num buckets for next year", function() {
        var startDate = new Date(Date.UTC(1980, 1, 2, 3, 4, 5));
        var nextYear = new Date(Date.UTC(1981, 0, 1, 0, 0, 0));
        bucketizer.setStartDate(startDate);
        bucketizer.setEndDate(nextYear);
        // So long as the end date is on the following UTC day, there will be 1 bucket
        expect(bucketizer.getNumBuckets()).toBe(11);
    });

    it("get num buckets uses fallback dates if none are set", function() {
        var startDate = new Date(Date.UTC(1980, 1, 2, 3, 4, 5));
        var nextMonth = new Date(Date.UTC(1980, 2, 1, 0, 0, 0));
        // Note that the setStartDate() and setEndDate() are not called
        expect(bucketizer.getNumBuckets(startDate, nextMonth)).toBe(1);
    });

    it("round down bucket works like zero out date", function() {
        var startDate = new Date(Date.UTC(1980, 1, 2, 3, 4, 5));
        bucketizer.setStartDate(startDate);

        var nextMonth = new Date(Date.UTC(1980, 2, 1, 3, 4, 5));
        expect(bucketizer.roundDownBucket(nextMonth).toUTCString()).toBe(bucketizer.getDateForBucket(1).toUTCString());
    });

    it("round down bucket will not go before start date", function() {
        var startDate = new Date(Date.UTC(1980, 1, 2, 3, 4, 5));
        bucketizer.setStartDate(startDate);

        var previousMonth = new Date(Date.UTC(1980, 0, 1, 3, 4, 5));
        expect(bucketizer.roundDownBucket(previousMonth).toUTCString()).toBe(bucketizer.getDateForBucket(0).toUTCString());
    });

    it("round up bucket goes to the start of the first bucket after the provided date", function() {
        var startDate = new Date(Date.UTC(1980, 1, 2, 3, 4, 5));
        bucketizer.setStartDate(startDate);

        // One second later than the start date, so go to the next bucket
        var nextSecond = new Date(Date.UTC(1980, 1, 2, 3, 4, 6));
        expect(bucketizer.roundUpBucket(nextSecond).toUTCString()).toBe(bucketizer.getDateForBucket(1).toUTCString());
    });

    it("round up bucket is idempotent", function() {
        // One second later than the start date, so go to the next bucket
        var nextSecond = new Date(Date.UTC(1980, 1, 2, 3, 4, 6));
        var rounded = bucketizer.roundUpBucket(nextSecond);
        expect(bucketizer.roundUpBucket(rounded).toUTCString()).toBe(rounded.toUTCString());
    });

    it("round up bucket will not go after end date", function() {
        var endDate = new Date(Date.UTC(1980, 1, 2, 3, 4, 5));
        bucketizer.setEndDate(endDate);

        var nextMonth = new Date(Date.UTC(1980, 2, 2, 3, 4, 5));
        var lastBucketDate = bucketizer.zeroOutDate(bucketizer.getEndDate());
        expect(bucketizer.roundUpBucket(nextMonth).toUTCString()).toBe(lastBucketDate.toUTCString());
    });
});
