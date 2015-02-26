describe("DateBucketizer", function() {
    var bucketizer;

    beforeEach(function() {
        bucketizer = DateBucketizer();
    });

    it("initial values are correct", function() {
        expect(bucketizer.getStartDate()).toBe(undefined);
        expect(bucketizer.getEndDate()).toBe(undefined);
        expect(bucketizer.getGranularity()).toBe(bucketizer.DAY);
        expect(bucketizer.getMillisMultiplier()).toBe(1000 * 60 * 60 * 24);
    });

    it("setters and getters for start and end dates work", function() {
        var past = new Date(1980, 1, 2, 3, 4, 5);
        var future = new Date(2050, 5, 4, 3, 2, 1)
        bucketizer.setStartDate(past);
        bucketizer.setEndDate(future);
        expect(bucketizer.getStartDate()).toBe(past);
        expect(bucketizer.getEndDate()).toBe(future);
    });

    it("switch granularities", function() {
        bucketizer.setGranularity(bucketizer.HOUR);
        expect(bucketizer.getGranularity()).toBe(bucketizer.HOUR);
        expect(bucketizer.getMillisMultiplier()).toBe(1000 * 60 * 60);
    });

    it("zero out days", function() {
        var originalDay = new Date(1980, 1, 2, 3, 4, 5);
        var zeroDay = bucketizer.zeroOutDate(originalDay);
        expect(zeroDay.getUTCFullYear()).toBe(originalDay.getUTCFullYear());
        expect(zeroDay.getUTCMonth()).toBe(originalDay.getUTCMonth());
        expect(zeroDay.getUTCDate()).toBe(originalDay.getUTCDate());
        expect(zeroDay.getUTCHours()).toBe(0);
        expect(zeroDay.getUTCMinutes()).toBe(0);
        expect(zeroDay.getUTCSeconds()).toBe(0);
        expect(zeroDay.getUTCMilliseconds()).toBe(0);
    });

    it("zero out hours", function() {
        var originalDay = new Date(1980, 1, 2, 3, 4, 5);
        bucketizer.setGranularity("hour");
        var zeroDay = bucketizer.zeroOutDate(originalDay);
        expect(zeroDay.getUTCFullYear()).toBe(originalDay.getUTCFullYear());
        expect(zeroDay.getUTCMonth()).toBe(originalDay.getUTCMonth());
        expect(zeroDay.getUTCDate()).toBe(originalDay.getUTCDate());
        expect(zeroDay.getUTCHours()).toBe(originalDay.getUTCHours());
        expect(zeroDay.getUTCMinutes()).toBe(0);
        expect(zeroDay.getUTCSeconds()).toBe(0);
        expect(zeroDay.getUTCMilliseconds()).toBe(0);
    });

    it("zero out is idempotent (daily)", function() {
        var originalDay = new Date(1980, 1, 2, 3, 4, 5);
        bucketizer.setGranularity(bucketizer.DAY);
        var zeroDay = bucketizer.zeroOutDate(originalDay);
        var doubleZeroDay = bucketizer.zeroOutDate(zeroDay);
        expect(doubleZeroDay.toUTCString()).toBe(zeroDay.toUTCString());
    });

    it("zero out is idempotent (hourly)", function() {
        var originalDay = new Date(1980, 1, 2, 3, 4, 5);
        bucketizer.setGranularity(bucketizer.HOUR);
        var zeroDay = bucketizer.zeroOutDate(originalDay);
        var doubleZeroDay = bucketizer.zeroOutDate(zeroDay);
        expect(doubleZeroDay.toUTCString()).toBe(zeroDay.toUTCString());
    });

    it("daily bucket index of start date is 0", function() {
        var startDate = new Date(Date.UTC(1980, 1, 2, 3, 4, 5));
        bucketizer.setStartDate(startDate);
        expect(bucketizer.getBucketIndex(startDate)).toBe(0);
    });

    it("daily bucket index of start date plus one day", function() {
        var startDate = new Date(Date.UTC(1980, 1, 2, 3, 4, 5));
        bucketizer.setStartDate(startDate);
        // Create a date that is at the start of the next date
        var nextDay = new Date(Date.UTC(
            startDate.getUTCFullYear(),
            startDate.getUTCMonth(),
            startDate.getUTCDate()+1,
            0,
            0
        ));
        expect(bucketizer.getBucketIndex(nextDay)).toBe(1);
    });

    it("daily bucket index of start date plus one hour", function() {
        var startDate = new Date(Date.UTC(1980, 1, 2, 3, 4, 5));
        bucketizer.setStartDate(startDate);
        // Create a date that is at the start of the next date
        var nextHour = new Date(Date.UTC(
            startDate.getUTCFullYear(),
            startDate.getUTCMonth(),
            startDate.getUTCDate(),
            startDate.getUTCHours()+1,
            0
        ));
        expect(bucketizer.getBucketIndex(nextHour)).toBe(0);
    });

    it("hourly bucket index of start date is 0", function() {
        var startDate = new Date(Date.UTC(1980, 1, 2, 3, 4, 5));
        bucketizer.setStartDate(startDate);
        bucketizer.setGranularity(bucketizer.HOUR);
        expect(bucketizer.getBucketIndex(startDate)).toBe(0);
    });

    it("hourly bucket index of start date plus one hour", function() {
        var startDate = new Date(Date.UTC(1980, 1, 2, 3, 4, 5));
        bucketizer.setStartDate(startDate);
        bucketizer.setGranularity(bucketizer.HOUR);
        // Create a date that is at the start of the next date
        var nextHour = new Date(Date.UTC(
            startDate.getUTCFullYear(),
            startDate.getUTCMonth(),
            startDate.getUTCDate(),
            startDate.getUTCHours()+1,
            0
        ));
        expect(bucketizer.getBucketIndex(nextHour)).toBe(1);
    });

    it("daily bucket index of start date plus one day", function() {
        var startDate = new Date(Date.UTC(1980, 1, 2, 3, 4, 5));
        bucketizer.setStartDate(startDate);
        bucketizer.setGranularity(bucketizer.HOUR);
        // Create a date that is at the start of the next date
        var nextDay = new Date(Date.UTC(
            startDate.getUTCFullYear(),
            startDate.getUTCMonth(),
            startDate.getUTCDate()+1,
            startDate.getUTCHours(),
            0
        ));
        expect(bucketizer.getBucketIndex(nextDay)).toBe(24);
    });

    it("bucket index uses fallback date if none is set", function() {
        var startDate = new Date(Date.UTC(1980, 1, 2, 3, 4, 5));
        // No start date, so the second argument is the fallback
        expect(bucketizer.getBucketIndex(startDate, startDate)).toBe(0);
    });

    it("bucket index uses fallback date if none is set", function() {
        var startDate = new Date(Date.UTC(1980, 1, 2, 3, 4, 5));
        var unusedFallbackDate = new Date(Date.UTC(1971, 1, 1, 1, 1, 1));
        // Start date is set, so fallback should not be used
        bucketizer.setStartDate(startDate);
        expect(bucketizer.getBucketIndex(startDate, unusedFallbackDate)).toBe(0);
    });

    it("getDateForBucket() returns a zeroed out date that matches that bucket (daily)", function() {
        var startDate = new Date(Date.UTC(1980, 1, 2, 3, 4, 5));
        var dateIndex = 1;
        bucketizer.setGranularity(bucketizer.DAY);
        bucketizer.setStartDate(startDate);
        var nextDate = bucketizer.getDateForBucket(dateIndex);
        // The representative date should be a zeroed out day
        var zeroNextDay = bucketizer.zeroOutDate(nextDate);
        expect(nextDate.toUTCString()).toBe(zeroNextDay.toUTCString());
        // And the index of the date should be the index we passed in
        expect(bucketizer.getBucketIndex(nextDate)).toBe(dateIndex);
    });

    it("getDateForBucket() returns a zeroed out date that matches that bucket (hourly)", function() {
        var startDate = new Date(Date.UTC(1980, 1, 2, 3, 4, 5));
        var dateIndex = 1;
        bucketizer.setGranularity(bucketizer.HOUR);
        bucketizer.setStartDate(startDate);
        var nextDate = bucketizer.getDateForBucket(dateIndex);
        // The representative date should be a zeroed out day
        var zeroNextDay = bucketizer.zeroOutDate(nextDate);
        expect(nextDate.toUTCString()).toBe(zeroNextDay.toUTCString());
        // And the index of the date should be the index we passed in
        expect(bucketizer.getBucketIndex(nextDate)).toBe(dateIndex);
    });

    it("get num buckets for zero length", function() {
        var startDate = new Date(Date.UTC(1980, 1, 2, 3, 4, 5));
        bucketizer.setStartDate(startDate);
        bucketizer.setEndDate(startDate);
        // All data is expected to be before the zeroed out end date, so if the end date is the same
        // as the start date, then there can't be any data.
        expect(bucketizer.getNumBuckets()).toBe(0);
    });

    it("get num buckets for start of next day", function() {
        var startDate = new Date(Date.UTC(1980, 1, 2, 3, 4, 5));
        var laterThatDay = new Date(Date.UTC(1980, 1, 3, 0, 0, 0));
        bucketizer.setStartDate(startDate);
        bucketizer.setEndDate(laterThatDay);
        // So long as the end date is on the following UTC day, there will be 1 bucket
        expect(bucketizer.getNumBuckets()).toBe(1);
    });
});
