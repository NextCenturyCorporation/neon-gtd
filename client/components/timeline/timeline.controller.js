'use strict';

/*
 * Copyright 2016 Next Century Corporation
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

/*
 * This visualization shows aggregated time data in a timeline.
 * @namespace neonDemo.controllers
 * @class timelineController
 * @constructor
 */
angular.module('neonDemo.controllers').controller('timelineController', ['$scope', '$timeout', '$interval', '$filter', 'opencpu', function($scope, $timeout, $interval, $filter, opencpu) {
    $scope.active.OPENCPU = opencpu;
    $scope.active.YEAR = "year";
    $scope.active.MONTH = "month";
    $scope.active.DAY = "day";
    $scope.active.HOUR = "hour";

    var DAY_HOUR_BUCKETIZER = dateBucketizer();
    var MONTH_BUCKETIZER = monthBucketizer();
    var YEAR_BUCKETIZER = yearBucketizer();

    $scope.data = [];
    $scope.bucketizer = DAY_HOUR_BUCKETIZER;
    $scope.referenceStartDate = undefined;
    $scope.referenceEndDate = undefined;

    // The extent filter for the chart brush contains either zero or two elements [startDate, endDate].
    $scope.extent = [];

    // Displayed dates.
    $scope.active.startDateForDisplay = undefined;
    $scope.active.endDateForDisplay = undefined;

    // Selected dates in the datetimepicker.
    $scope.active.filter = {
        start: undefined,
        end: undefined
    };

    // Menu options.
    $scope.active.dateField = {};
    $scope.active.granularity = $scope.active.DAY;
    $scope.active.numberInvalid = 0;
    $scope.active.numberValid = 0;
    $scope.active.primarySeries = undefined;
    $scope.active.showFocus = "on_filter";

    // Animation controls.
    $scope.active.animatingTime = false;
    $scope.active.animationFrame = 0;
    $scope.active.animationStartFrame = 0;
    $scope.active.animationFrameDelay = 250;
    $scope.active.showAnimationControls = false;

    var datesEqual = function(a, b) {
        return a.toUTCString() === b.toUTCString();
    };

    var getDateTimePickerStart = function() {
        return new Date(Date.UTC($scope.active.filter.start.getFullYear(), $scope.active.filter.start.getMonth(), $scope.active.filter.start.getDate(), $scope.active.filter.start.getHours()));
    };

    var getDateTimePickerEnd = function() {
        return new Date(Date.UTC($scope.active.filter.end.getFullYear(), $scope.active.filter.end.getMonth(), $scope.active.filter.end.getDate() + 1, $scope.active.filter.end.getHours()));
    };

    var setDateTimePickerStart = function(date) {
        $scope.active.filter.start = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours());
    };

    var setDateTimePickerEnd = function(date) {
        $scope.active.filter.end = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - 1, date.getUTCHours());
    };

    /**
     * Begins an animation loop by calling doTimeAnimation() at regular intervals.  An animation
     * consists of separate events for each bucket of time data at the timeline selector's current
     * time resolution.  On each animation tick, a date-selected event will be emitted to allow
     * other visualization to respond to the animation loop with their own customized graphics or filtered data.
     * @method playTimeAnimation
     */
    $scope.playTimeAnimation = function() {
        $scope.active.animatingTime = true;
        $scope.active.animationTimeout = $interval($scope.doTimeAnimation, $scope.active.animationFrameDelay);
    };

    /**
     * Pauses an animation loop by cancelling the automatic doTimeAnimation interval.
     * @method pauseTimeAnimation
     */
    $scope.pauseTimeAnimation = function() {
        $interval.cancel($scope.active.animationTimeout);
        $scope.active.animatingTime = false;
    };

    /**
     * Stops an animation loop by cancelling the automatic doTimeAnimation interval and resetting the
     * animation frame.
     * @method stopTimeAnimation
     */
    $scope.stopTimeAnimation = function() {
        $interval.cancel($scope.active.animationTimeout);
        $scope.active.animatingTime = false;

        // Clear the current step data.
        $scope.active.animationFrame = 0;
        $scope.active.animationStartFrame = 0;
        $scope.functions.publish('date_selected', {});
        onDateSelected({});
    };

    /**
     * Step ahead one frame of animation.  This emits a selection of the next bucket of temporal data.
     * @method stepTimeAnimation
     */
    $scope.stepTimeAnimation = function() {
        if($scope.active.animatingTime) {
            $scope.pauseTimeAnimation();
        }
        $scope.doTimeAnimation();
    };

    /**
     * Get the animation frame for the first non-empty bucket within our brushed time range, or simply
     * the first non-empty time bucket if no chart brush extent exists.
     * @method getAnimationStartFrame
     */
    $scope.getAnimationStartFrame = function() {
        var origStartBucketIndex = ($scope.extent.length && $scope.extent[0]) ?
            $scope.bucketizer.getBucketIndex($scope.extent[0]) : 0;

        var indexLimit = ($scope.extent.length && $scope.extent[1]) ?
            $scope.bucketizer.getBucketIndex($scope.extent[1]) : $scope.bucketizer.getNumBuckets();

        var startBucketIndex = nextNonEmptyDate(origStartBucketIndex, indexLimit);

        return (startBucketIndex === -1) ? origStartBucketIndex : startBucketIndex;
    };

    /**
     * Get the first non-empty bucket index (within indexLimit) starting with bucketIndex.
     * @param {int} bucketIndex
     * @param {int} indexLimit
     * @method nextNonEmptyDate
     * @return {int} The first non-empty bucket index or -1 if there is none within indexLimit (exclusive)
     * @private
     */
    var nextNonEmptyDate = function(bucketIndex, indexLimit) {
        if(bucketIndex >= indexLimit) {
            return -1;
        }

        var dateData = _.find($scope.primarySeries.data, {
            date: $scope.bucketizer.getDateForBucket(bucketIndex)
        });

        if(dateData && dateData.value > 0) {
            return bucketIndex;
        }

        return nextNonEmptyDate(bucketIndex + 1, indexLimit);
    };

    /**
     * Get the animation frame limit for the brushed time range, or simply
     * the overall frame limit if no chart brush extent exists.
     * @method getAnimationFrameLimit
     */
    $scope.getAnimationFrameLimit = function() {
        var origFrameLimit = ($scope.extent.length && $scope.extent[1]) ?
            $scope.bucketizer.getBucketIndex($scope.extent[1]) : $scope.bucketizer.getNumBuckets();

        var indexMin = ($scope.extent.length && $scope.extent[0]) ?
            $scope.bucketizer.getBucketIndex($scope.extent[0]) : 0;

        var frameLimit = previousNonEmptyDate(origFrameLimit - 1, indexMin);

        return (frameLimit === -1) ? origFrameLimit : frameLimit + 1;
    };

    /**
     * Get the first non-empty bucket index within indexMin starting with bucketIndex and going backwards.
     * @param {int} bucketIndex
     * @param {int} indexMin
     * @method previousNonEmptyDate
     * @return {int} The first non-empty bucket index or -1 if there is none within indexMin (inclusive)
     * @private
     */
    var previousNonEmptyDate = function(bucketIndex, indexMin) {
        if(bucketIndex < indexMin) {
            return -1;
        }

        var dateData = _.find($scope.primarySeries.data, {
            date: $scope.bucketizer.getDateForBucket(bucketIndex)
        });

        if(dateData && dateData.value > 0) {
            return bucketIndex;
        }

        return previousNonEmptyDate(bucketIndex - 1, indexMin);
    };

    /**
     * Perform a single frame an time animation.  For this directive, the time bucket corresponding
     * to the current animation frame will be highlighted.  Additionally, a date selection message will
     * be published for the bucket's date range.  This will allow other visualizations to sync up their
     * display and match animation frames.
     * @method doTimeAnimation
     */
    $scope.doTimeAnimation = function() {
        // Get the frame limits to see if we need to reset our animation.
        $scope.active.animationStartFrame = $scope.getAnimationStartFrame();
        var frameLimit = $scope.getAnimationFrameLimit();
        if(($scope.active.animationFrame >= frameLimit) || ($scope.active.animationFrame < $scope.active.animationStartFrame)) {
            $scope.active.animationFrame = $scope.active.animationStartFrame;
        }

        // Get the time range for the current animation frame and publish it.
        var dateSelected = {
            start: $scope.bucketizer.getDateForBucket($scope.active.animationFrame),
            end: $scope.bucketizer.getDateForBucket($scope.active.animationFrame + 1)
        };

        // Cleanup the animation end time on the last frame.
        if($scope.active.animationFrame === ($scope.bucketizer.getNumBuckets() - 1)) {
            dateSelected.end = $scope.bucketizer.getEndDate();
        }

        // Convert dates to longs for transmission as JSON.
        dateSelected.start = (dateSelected.start !== undefined) ? dateSelected.start.getTime() : undefined;
        dateSelected.end = (dateSelected.end !== undefined) ? dateSelected.end.getTime() : undefined;

        $scope.functions.publish('date_selected', dateSelected);
        onDateSelected(dateSelected);

        // Advance the animation step data.
        $scope.active.animationFrame++;
    };

    $scope.handleDateTimePickChange = function() {
        // Convert the datetimepicker dates from UTC to local time to match the other dates used throughout the application.
        var start = getDateTimePickerStart();
        var end = getDateTimePickerEnd();

        if($scope.extent.length && datesEqual(start, $scope.extent[0]) && datesEqual(end, $scope.extent[1])) {
            $scope.functions.getElement(".save-button").addClass("disabled");
        } else if(!$scope.extent.length && datesEqual(start, $scope.bucketizer.getStartDate()) && datesEqual(end, $scope.bucketizer.getEndDate())) {
            $scope.functions.getElement(".save-button").addClass("disabled");
        } else {
            $scope.functions.getElement(".save-button").removeClass("disabled");
        }
    };

    $scope.handleDateTimePickSave = function() {
        // Convert the datetimepicker dates from UTC to local time to match the other dates used throughout the application.
        var start = getDateTimePickerStart();
        var end = getDateTimePickerEnd();

        $scope.functions.getElement(".save-button").addClass("disabled");
        $scope.functions.getElement(".neon-datetimepicker").removeClass("open");

        if(datesEqual(start, $scope.bucketizer.getStartDate()) && datesEqual(end, $scope.bucketizer.getEndDate())) {
            if($scope.extent.length) {
                $scope.removeFilter();
            }
            return;
        }

        $scope.extent = [start, end];
        onChangeFilter();
        $scope.chart.renderExtent($scope.extent);
    };

    $scope.handleDateTimePickCancel = function() {
        if($scope.extent.length) {
            setDateTimePickerStart($scope.extent[0]);
            setDateTimePickerEnd($scope.extent[1]);
        } else if($scope.bucketizer.getStartDate() && $scope.bucketizer.getEndDate()) {
            setDateTimePickerStart($scope.bucketizer.getStartDate());
            setDateTimePickerEnd($scope.bucketizer.getEndDate());
        }

        $scope.functions.getElement(".save-button").addClass("disabled");
        $scope.functions.getElement(".neon-datetimepicker").removeClass("open");
    };

    /**
     * Update any book-keeping fields that need to change when the granularity changes.
     */
    var updateBucketizer = function() {
        if($scope.active.granularity === $scope.active.MONTH) {
            $scope.bucketizer = MONTH_BUCKETIZER;
        } else if($scope.active.granularity === $scope.active.YEAR) {
            $scope.bucketizer = YEAR_BUCKETIZER;
        } else {
            $scope.bucketizer = DAY_HOUR_BUCKETIZER;
            $scope.bucketizer.setGranularity($scope.active.granularity);
        }
    };

    /**
     * Updates the starts/end dates based on the chart granularity
     */
    var updateDates = function() {
        // Updates depend on having valid reference dates which may not be the case during
        // directive initialization
        if($scope.referenceStartDate && $scope.referenceEndDate) {
            $scope.bucketizer.setStartDate($scope.bucketizer.zeroOutDate($scope.referenceStartDate));
            var endDateBucket = $scope.bucketizer.getBucketIndex($scope.referenceEndDate);
            var afterEndDate = $scope.bucketizer.getDateForBucket(endDateBucket + 1);
            $scope.bucketizer.setEndDate(afterEndDate);
            setDateTimePickerStart($scope.bucketizer.getStartDate());
            setDateTimePickerEnd($scope.bucketizer.getEndDate());
            $scope.functions.publish('date_bucketizer', {
                startDate: $scope.bucketizer.getStartDate().getTime(),
                endDate: $scope.bucketizer.getEndDate().getTime(),
                granularity: $scope.bucketizer.getGranularity()
            });
        }
    };

    /**
     * Sets the display dates that are used by the template to the provided values.
     * @param {Date} displayStartDate
     * @param {Date} displayEndDate
     * @method setDisplayDates
     * @private
     */
    var setDisplayDates = function(displayStartDate, displayEndDate) {
        $scope.active.startDateForDisplay = $scope.formatStartDate(displayStartDate);
        $scope.active.endDateForDisplay = $scope.formatEndDate(displayEndDate);

        var linkData = {};
        linkData[neonMappings.DATE] = {};
        linkData[neonMappings.DATE][neonMappings.START_DATE] = displayStartDate.toISOString();
        linkData[neonMappings.DATE][neonMappings.END_DATE] = displayEndDate.toISOString();
        $scope.showLinksPopupButton = $scope.functions.createLinksForData(neonMappings.DATE, linkData, $scope.getLinksPopupDateKey());
    };

    /**
     * Clears the display dates.
     * @method clearDisplayDates
     * @private
     */
    var clearDisplayDates = function() {
        $scope.active.startDateForDisplay = undefined;
        $scope.active.endDateForDisplay = undefined;
        $scope.functions.removeLinks();
    };

    $scope.formatStartDate = function(startDate) {
        var formattedStartDate = new Date(startDate.getUTCFullYear(),
            startDate.getUTCMonth(),
            startDate.getUTCDate(),
            startDate.getUTCHours());
        var format = $scope.bucketizer.getDateFormat();
        formattedStartDate = $filter("date")(formattedStartDate.toISOString(), format);
        return formattedStartDate;
    };

    $scope.formatEndDate = function(endDate) {
        var formattedEndDate = new Date(endDate.getUTCFullYear(),
            endDate.getUTCMonth(),
            endDate.getUTCDate(),
            endDate.getUTCHours());

        // Describing ranges is odd. If an event lasts 2 hours starting at 6am, then it
        // lasts from 6am to 8am. But if an event starts on the 6th and lasts 2 days, then
        // it lasts from the 6th to the 7th.
        if($scope.active.granularity !== $scope.active.HOUR) {
            formattedEndDate = new Date(formattedEndDate.getTime() - 1);
        }
        var format = $scope.bucketizer.getDateFormat();
        formattedEndDate = $filter("date")(formattedEndDate.toISOString(), format);
        return formattedEndDate;
    };

    $scope.functions.onInit = function() {
        $scope.functions.subscribe("date_selected", onDateSelected);
        $scope.chart = new charts.TimelineSelectorChart($scope.functions.getElement(".timeline-selector-chart")[0]);
        $scope.chart.render([]);

        $scope.chart.addBrushHandler(function(extent) {
            // Wrap our extent change in $apply since this is fired from a D3 event and outside of angular's digest cycle.
            $scope.$apply(function() {
                XDATA.userALE.log({
                    activity: "select",
                    action: "click",
                    elementId: "timeline-range",
                    elementType: "canvas",
                    elementSub: "date-range",
                    elementGroup: "chart_group",
                    source: "user",
                    tags: ["timeline", "date-range", "filter"]
                });

                $scope.extent = extent;
                onChangeFilter();

                if($scope.active.showFocus === "on_filter") {
                    $scope.chart.toggleFocus(true);
                }
            });
        });

        $scope.chart.setHoverListener(function(startDate, endDate) {
            $scope.$apply(function() {
                $scope.functions.publish('date_selected', {
                    start: (startDate !== undefined) ? startDate.getTime() : undefined,
                    end: (endDate !== undefined) ? endDate.getTime() : undefined
                });
            });
        });

        if($scope.bindings.granularity) {
            $scope.active.granularity = $scope.bindings.granularity.toLowerCase();
            updateBucketizer();
        }

        $scope.functions.getElement(".neon-datetimepicker").on("hide.bs.dropdown", function() {
            return false;
        });

        $scope.$watch("functions.isFilterSet()", function() {
            // Use a timeout with a delay so the resize is called after angular displays the date filter notification.
            $timeout(function() {
                resizeDateTimePickerDropdownToggle($scope.functions.getElement().width());
            }, 250);
        });
    };

    /**
     * Event handler for date selected events issued over Neon's messaging channels.
     * @param {Object} message A Neon date selected message.
     * @method onDateSelected
     * @private
     */
    var onDateSelected = function(message) {
        if(message.start && message.end) {
            $scope.chart.selectDate(_.isNumber(message.start) ? new Date(message.start) : undefined,
                _.isNumber(message.end) ? new Date(message.end) : undefined);
        } else {
            $scope.chart.deselectDate();
        }
    };

    $scope.functions.onResize = function(elementHeight, elementWidth, titleHeight, headersHeight) {
        var dateTimePickerDropdownMenu = $scope.functions.getElement(".neon-datetimepicker .dropdown-menu");
        dateTimePickerDropdownMenu.css("max-height", (elementHeight - headersHeight) + "px");
        dateTimePickerDropdownMenu.css("max-width", (elementWidth) + "px");
        resizeDateTimePickerDropdownToggle(elementWidth);

        if($scope.chart) {
            // TODO Fix size calculations in the timeline selector chart so we don't have to add/subtract these values to make the chart fit the visualization.
            $scope.chart.config.height = elementHeight - headersHeight - 20;
            $scope.chart.config.width = elementWidth + 30;

            if($scope.active.showFocus === "always" || ($scope.active.showFocus === "on_filter" && $scope.extent.length > 0)) {
                $scope.chart.toggleFocus(true);
            } else {
                $scope.chart.toggleFocus(false);
            }
        }
    };

    var resizeDateTimePickerDropdownToggle = function(elementWidth) {
        var animationControlsWidth = $scope.functions.getElement(".animation-controls").outerWidth(true);
        var filterWidth = $scope.functions.getElement(".filter-reset").outerWidth(true);
        $scope.functions.getElement(".neon-datetimepicker .dropdown-toggle").css("max-width", (elementWidth - animationControlsWidth - filterWidth - 5) + "px");
    };

    $scope.handleChangeGranularity = function() {
        updateBucketizer();
        updateDates();
        if($scope.extent.length) {
            var newExtentStart = $scope.bucketizer.roundDownBucket($scope.extent[0]);
            var newExtentEnd = $scope.bucketizer.roundUpBucket($scope.extent[1]);
            if(newExtentStart.getTime() !== $scope.extent[0].getTime() || newExtentEnd.getTime() !== $scope.extent[1].getTime()) {
                $scope.extent = [newExtentStart, newExtentEnd];
                onChangeFilter();
            }
        }
        $scope.functions.logChangeAndUpdate("granularity", $scope.active.granularity, "button");
    };

    var onChangeFilter = function() {
        if($scope.extent.length) {
            if($scope.extent[0].getTime() === $scope.extent[1].getTime() && $scope.bucketizer.getStartDate() !== undefined && $scope.bucketizer.getEndDate() !== undefined) {
                $scope.removeFilter();
                return;
            }
            if(datesEqual($scope.extent[0], $scope.bucketizer.getStartDate()) && datesEqual($scope.extent[1], $scope.bucketizer.getEndDate())) {
                $scope.removeFilter();
                return;
            }
        }

        if(!$scope.extent.length) {
            $scope.chart.clearBrush();
        }

        setDateTimePickerStart($scope.extent.length ? $scope.extent[0] : $scope.bucketizer.getStartDate());
        setDateTimePickerEnd($scope.extent.length ? $scope.extent[1] : $scope.bucketizer.getEndDate());

        $scope.chart.renderExtent($scope.extent);

        updateChartTimesAndTotal();

        if($scope.extent.length) {
            $scope.functions.updateNeonFilter();
        }

        if($scope.showFocus === "on_filter") {
            $scope.chart.toggleFocus($scope.extent.length);
        }

        // Resize the dropdown toggle to an arbitrary small value to stop the date filter notification from wrapping in small timeline
        // visualizations.  It will be automatically resized based on the visualization width after a short delay.
        $scope.functions.getElement(".neon-datetimepicker .dropdown-toggle").css("max-width", "40px");
    };

    $scope.handleChangeShowFocus = function() {
        XDATA.userALE.log({
            activity: "alter",
            action: "click",
            elementId: "timeline",
            elementType: "button",
            elementSub: "showFocus",
            elementGroup: "chart_group",
            source: "user",
            tags: ["timeline", "showFocus", $scope.active.showFocus]
        });

        if($scope.active.showFocus === 'always') {
            $scope.chart.toggleFocus(true);
        } else if($scope.active.showFocus === 'never') {
            $scope.chart.toggleFocus(false);
        } else if($scope.active.showFocus === 'on_filter' && $scope.extent.length > 0) {
            $scope.chart.toggleFocus(true);
        }
    };

    $scope.functions.createFilterTrayText = function() {
        return ($scope.active.showInvalidDatesFilter ? "All Invalid Dates" : $scope.formatStartDate(getFilterStartDate()) + " to " + $scope.formatEndDate(getFilterEndDate()));
    };

    /**
     * Replaces all filters with a new one for invalid dates. This results in no data being shown on the timeline.
     * @method sendInvalidDates
     */
    $scope.handleToggleInvalidDatesFilter = function() {
        $scope.extent = [];
        onChangeFilter();
        if($scope.bucketizer.getStartDate() && $scope.bucketizer.getEndDate()) {
            setDateTimePickerStart($scope.bucketizer.getStartDate());
            setDateTimePickerEnd($scope.bucketizer.getEndDate());
        }
        $scope.functions.updateNeonFilter({
            queryAfterFilter: true
        });
    };

    $scope.handleToggleShowAnimationControls = function() {
        // TODO Logging
        resizeDateTimePickerDropdownToggle($scope.functions.getElement().width());
    };

    $scope.functions.createNeonFilterClause = function(databaseAndTableName, fieldName) {
        var clauses = [];
        if($scope.active.showInvalidDatesFilter) {
            var lowerBoundFilterClause = neon.query.where(fieldName, '<', new Date("1970-01-01T00:00:00.000Z"));
            var upperBoundFilterClause = neon.query.where(fieldName, '>', new Date("2025-01-01T00:00:00.000Z"));
            var nullFilterClause = neon.query.where(fieldName, '=', null);
            clauses = [lowerBoundFilterClause, upperBoundFilterClause, nullFilterClause];
            return neon.query.or.apply(this, clauses);
        }

        var startDate = getFilterStartDate();
        var endDate = getFilterEndDate();
        var startFilterClause = neon.query.where(fieldName, '>=', startDate);
        var endFilterClause = neon.query.where(fieldName, '<', endDate);
        clauses = [startFilterClause, endFilterClause];
        return neon.query.and.apply(this, clauses);
    };

    var getFilterStartDate = function() {
        var startDate = $scope.extent.length < 2 ? $scope.bucketizer.getStartDate() : $scope.extent[0];
        return $scope.bucketizer.zeroOutDate(startDate);
    };

    var getFilterEndDate = function() {
        var endDate = $scope.extent.length < 2 ? $scope.bucketizer.getEndDate() : $scope.extent[1];
        return $scope.bucketizer.roundUpBucket(endDate);
    };

    $scope.functions.isFilterSet = function() {
        return $scope.extent.length === 2;
    };

    $scope.functions.areDataFieldsValid = function() {
        return $scope.functions.isFieldValid($scope.active.dateField);
    };

    $scope.functions.getFilterFields = function() {
        return [$scope.active.dateField];
    };

    $scope.functions.updateFilterValues = function(neonFilter) {
        if($scope.functions.getNumberOfFilterClauses(neonFilter) === 2) {
            $scope.extent = [
                new Date(neonFilter.filter.whereClause.whereClauses[0].rhs),
                new Date(neonFilter.filter.whereClause.whereClauses[1].rhs)
            ];
            setDateTimePickerStart($scope.extent[0]);
            setDateTimePickerEnd($scope.extent[1]);
        }
    };

    $scope.functions.removeFilterValues = function() {
        $scope.extent = [];
        onChangeFilter();
        $scope.active.showInvalidDatesFilter = false;
    };

    $scope.functions.onUpdateFields = function() {
        $scope.active.dateField = $scope.functions.findFieldObject("dateField", neonMappings.DATE);
    };

    $scope.functions.onChangeOption = function() {
        $scope.bucketizer.setStartDate(undefined);
        clearDisplayDates();
        $scope.referenceStartDate = undefined;
        $scope.referenceEndDate = undefined;
        $scope.data = [];
    };

    var buildValidDatesQuery = function(query) {
        var yearGroupClause = new neon.query.GroupByFunctionClause(neon.query.YEAR, $scope.active.dateField.columnName, $scope.active.YEAR);
        var monthGroupClause = new neon.query.GroupByFunctionClause(neon.query.MONTH, $scope.active.dateField.columnName, $scope.active.MONTH);
        var dayGroupClause = new neon.query.GroupByFunctionClause(neon.query.DAY, $scope.active.dateField.columnName, $scope.active.DAY);
        var hourGroupClause = new neon.query.GroupByFunctionClause(neon.query.HOUR, $scope.active.dateField.columnName, $scope.active.HOUR);

        // Group by the appropriate granularity.
        if($scope.active.granularity === $scope.active.YEAR) {
            query.groupBy(yearGroupClause);
        } else if($scope.active.granularity === $scope.active.MONTH) {
            query.groupBy(yearGroupClause, monthGroupClause);
        } else if($scope.active.granularity === $scope.active.DAY) {
            query.groupBy(yearGroupClause, monthGroupClause, dayGroupClause);
        } else if($scope.active.granularity === $scope.active.HOUR) {
            query.groupBy(yearGroupClause, monthGroupClause, dayGroupClause, hourGroupClause);
        }

        return query.aggregate(neon.query.COUNT, '*', 'count').enableAggregateArraysByElement();
    };

    $scope.functions.createNeonQueryWhereClause = function() {
        return neon.query.and(
            neon.query.where($scope.active.dateField.columnName, '>=', new Date("1970-01-01T00:00:00.000Z")),
            neon.query.where($scope.active.dateField.columnName, '<=', new Date("2025-01-01T00:00:00.000Z"))
        );
    };

    /**
     * Helper method for queryForChartData(). Creates the Query object for invalid dates to be used by this moethod.
     * @method buildInvalidDatesQuery
     * @private
     * @return {neon.query.Query} query The Query object to be used by queryForChartData()
     */
    var buildInvalidDatesQuery = function(query) {
        // Replace the where clause created by $scope.functions.createNeonQueryWhereClause with an invalid date where clause.
        query.filter.whereClause.whereClauses[0] = neon.query.or(
            neon.query.where($scope.active.dateField.columnName, '<', new Date("1970-01-01T00:00:00.000Z")),
            neon.query.where($scope.active.dateField.columnName, '>', new Date("2025-01-01T00:00:00.000Z")),
            neon.query.where($scope.active.dateField.columnName, '=', null)
        );

        return query.aggregate(neon.query.COUNT, '*', 'invalidCount').enableAggregateArraysByElement();
    };

    $scope.functions.addToQuery = function(query) {
        var queryGroup = new neon.query.QueryGroup();
        var validDatesQuery = buildValidDatesQuery(angular.copy(query));
        var invalidDatesQuery = buildInvalidDatesQuery(query);

        queryGroup.addQuery(validDatesQuery);
        queryGroup.addQuery(invalidDatesQuery);

        if($scope.functions.isFilterSet()) {
            var filterClause = $scope.functions.createNeonFilterClause({
                database: $scope.active.database.name,
                table: $scope.active.table.name
            }, $scope.active.dateField.columnName);
            queryGroup.ignoreFilters([$scope.functions.getFilterKey(filterClause)]);
        }

        return queryGroup;
    };

    $scope.functions.executeQuery = function(connection, query) {
        return connection.executeQueryGroup(query);
    };

    /**
     * Updates the chart start/end times to use as a Neon selection and their associated conversion for displaying in
     * UTC. The display value for the total records is updates as well.
     * of the data array.
     * @method updateChartTimesAndTotal
     * @private
     */
    var updateChartTimesAndTotal = function() {
        // Try to find primary series in new data
        var i = 0;
        var primaryIndex = 0;
        if($scope.primarySeries) {
            for(i = 0; i < $scope.data.length; i++) {
                if($scope.primarySeries.name === $scope.data[i].name) {
                    primaryIndex = i;
                    break;
                }
            }
        }
        $scope.primarySeries = $scope.data[primaryIndex];
        $scope.chart.updatePrimarySeries($scope.primarySeries);
        $scope.chart.render($scope.data);
        $scope.chart.renderExtent($scope.extent);

        // Handle bound conditions.

        var extentStartDate;
        var extentEndDate;
        if($scope.extent.length === 2) {
            extentStartDate = $scope.extent[0];
            extentEndDate = $scope.extent[1];
        } else {
            extentStartDate = $scope.bucketizer.getStartDate();
            extentEndDate = $scope.bucketizer.getEndDate();
        }

        var total = 0;

        if(extentStartDate && extentEndDate) {
            extentStartDate = $scope.bucketizer.zeroOutDate(extentStartDate);
            extentEndDate = $scope.bucketizer.roundUpBucket(extentEndDate);

            var startIdx = $scope.bucketizer.getBucketIndex(extentStartDate);
            var endIdx = $scope.bucketizer.getBucketIndex(extentEndDate);

            // Update the start/end times and totals used for the Neon selection and their
            // display versions.  Since Angular formats dates as local values, we create new display values
            // for the appropriate date we want to appear in this directive's associated partial.
            // This essentially shifts the display times from local to the value we want to appear in UTC time.

            // endIdx points to the start of the day/hour just after the buckets we want to count, so do not
            // include the bucket at endIdx.
            for(i = startIdx; i < endIdx; i++) {
                if($scope.primarySeries.data[i]) {
                    total += $scope.primarySeries.data[i].value;
                }
            }
        }

        if(isNaN(extentStartDate) || isNaN(extentEndDate)) {
            clearDisplayDates();
        } else {
            neon.safeApply($scope, function() {
                setDisplayDates(extentStartDate, extentEndDate);
            });
        }

        $scope.active.numberValid = total;
    };

    $scope.functions.updateData = function(data) {
        var inputData = data || [];

        var invalidData = _.filter(inputData, function(item) {
            return item.invalidCount;
        });

        $scope.active.numberInvalid = invalidData.length ? invalidData[0].invalidCount : 0;

        var validData = $scope.active.showInvalidDatesFilter ? [] : _.filter(inputData, function(item) {
            return !item.invalidCount;
        });

        // Any time new data is fetched, the old MMPP analysis is invalidated.
        $scope.active.displayEventProbabilities = false;

        if(validData.length > 0) {
            var updateDatesCallback = function() {
                if($scope.bucketizer.getStartDate() === undefined || $scope.bucketizer.getEndDate() === undefined) {
                    updateDates();
                }
                var timelineData = createTimelineData(validData);
                $scope.data = timelineData;
                $scope.active.showNoDataError = !$scope.data || !$scope.data.length || !$scope.data[0].data || !$scope.data[0].data.length;
                updateChartTimesAndTotal();
                addTimeSeriesAnalysis($scope.data[0].data, timelineData);
                $scope.chart.updateGranularity($scope.active.granularity);
                $scope.chart.render($scope.data);
                $scope.chart.renderExtent($scope.extent);
            };

            // on the initial query, setup the start/end bounds
            if($scope.referenceStartDate === undefined || $scope.referenceEndDate === undefined) {
                queryForMinDate(updateDatesCallback);
            } else {
                updateDatesCallback();
            }
        } else {
            XDATA.userALE.log({
                activity: "alter",
                action: "clear",
                elementId: "timeline",
                elementType: "canvas",
                elementSub: "timeline",
                elementGroup: "chart_group",
                source: "system",
                tags: ["timeline", "clear"]
            });
            $scope.data = createTimelineData(validData);
            $scope.active.showNoDataError = !$scope.data || !$scope.data.length || !$scope.data[0].data || !$scope.data[0].data.length;
            updateChartTimesAndTotal();
            $scope.chart.updateGranularity($scope.active.granularity);
            $scope.chart.render($scope.data);
            $scope.chart.renderExtent($scope.extent);
        }
    };

    var queryForMinDate = function(callback) {
        if($scope.bindings.overrideStartDate) {
            $scope.referenceStartDate = new Date($scope.bindings.overrideStartDate);
            queryForMaxDate(callback);
        } else {
            // TODO: neon doesn't yet support a more efficient way to just get the min/max fields without aggregating
            // TODO: This could be done better with a promise framework - just did this in a pinch for a demo
            $scope.functions.queryAndUpdate({
                addToQuery: function(query) {
                    query.sortBy($scope.active.dateField.columnName, neon.query.ASCENDING).limit(1).ignoreFilters();
                    return query;
                },
                executeQuery: function(connection, query) {
                    return connection.executeQuery(query);
                },
                updateData: function(data) {
                    if(data) {
                        var dates = data.length ? getDates(data[0]) : [];
                        $scope.referenceStartDate = dates.length ? dates[0] : new Date();
                        queryForMaxDate(callback);
                    }
                }
            });
        }
    };

    var queryForMaxDate = function(callback) {
        if($scope.bindings.overrideEndDate) {
            $scope.referenceEndDate = new Date($scope.bindings.overrideEndDate);
            callback();
        } else {
            $scope.functions.queryAndUpdate({
                addToQuery: function(query) {
                    query.sortBy($scope.active.dateField.columnName, neon.query.DESCENDING).limit(1).ignoreFilters();
                    return query;
                },
                executeQuery: function(connection, query) {
                    return connection.executeQuery(query);
                },
                updateData: function(data) {
                    if(data) {
                        var dates = data.length ? getDates(data[0]) : [];
                        $scope.referenceEndDate = dates.length ? dates[dates.length - 1] : new Date();
                        callback();
                    }
                }
            });
        }
    };

    /**
     * Finds and returns the date(s) in the date field in the data. If the date contains '.', representing that the date is in an object
     * within the data, it will find the nested value.
     * @method getDates
     * @param {Object} dataItem
     * @return {Array}
     * @private
     */
    var getDates = function(dataItem) {
        return neon.helpers.getNestedValues(dataItem, [$scope.active.dateField.columnName]).filter(function(value) {
            return value[$scope.active.dateField.columnName];
        }).map(function(value) {
            return new Date(value[$scope.active.dateField.columnName]);
        }).sort(function(a, b) {
            return a.getTime() - b.getTime();
        });
    };

    /**
     * Creates a new data array used to populate our contained timeline.  This function is used
     * as or by Neon query handlers.
     * @param {Object} queryResults Results returned from a Neon query.
     * @param {Array} queryResults.data The aggregate numbers for the heat chart cells.
     * @method createTimelineData
     * @private
     */
    var createTimelineData = function(data) {
        var queryData = [];
        var i = 0;
        var rawLength = data.length;

        if(rawLength > 0) {
            var numBuckets = $scope.bucketizer.getNumBuckets();

            // Initialize our time buckets.
            for(i = 0; i < numBuckets; i++) {
                var bucketGraphDate = $scope.bucketizer.getDateForBucket(i);
                queryData[i] = {
                    date: bucketGraphDate,
                    value: 0
                };
            }

            // Fill our data into the appropriate interval buckets.
            var resultDate;
            for(i = 0; i < rawLength; i++) {
                resultDate = new Date(Date.UTC(data[i].year, (data[i].month || 1) - 1, data[i].day || 1, data[i].hour || 0));
                var bucketIndex = $scope.bucketizer.getBucketIndex(resultDate);
                if(queryData[bucketIndex]) {
                    queryData[bucketIndex].value += data[i].count;
                }
            }
        }

        return [{
            name: 'Total',
            type: 'bar',
            color: '#39b54a',
            data: queryData
        }];
    };

    /**
     * Adds the timeseries analysis to the data to be graphed.
     * @param timelineData an array of {date: Date(...), value: n} objects, one for each day
     * @param graphData the array of objects that will be graphed
     */
    var addTimeSeriesAnalysis = function(timelineData, graphData) {
        // If OpenCPU isn't available, then just return without doing anything.
        if(!ocpu.connected) {
            return;
        }

        if($scope.opencpu.enableStl2) {
            addStl2TimeSeriesAnalysis(timelineData, graphData);
        }
        if($scope.opencpu.enableAnomalyDetection) {
            addAnomalyDetectionAnalysis(timelineData, graphData);
        }
    };

    $scope.runMMPP = function() {
        if(!ocpu.connected) {
            return;
        }
        addMmppTimeSeriesAnalysis($scope.primarySeries.data, $scope.data);
    };

    var addMmppTimeSeriesAnalysis = function(timelineData, graphData) {
        // The MMPP analysis needs hourly data
        if($scope.active.granularity !== $scope.active.HOUR) {
            return;
        }
        // The MMPP code wants a matrix of the counts, with each row being an hour of
        // the day and each column being a day. Depending on the dataset, the results from the
        // dataset may start in the middle of the first day. Missing data should be encoded as -1

        var timelineMatrix = [];
        for(var i = 0; i < 24; ++i) {
            timelineMatrix[i] = [];
        }
        var day = 0; var hour = 0;
        for(day = 0; day * 24 < timelineData.length; ++day) {
            for(hour = 0; hour < 24; ++hour) {
                var index = day * 24 + hour;
                if(index < timelineData.length) {
                    timelineMatrix[hour][day] = timelineData[day * 24 + hour].value;
                } else {
                    timelineMatrix[hour][day] = -1;
                }
            }
        }
        ocpu.rpc("nsensorMMPP", {
            N: timelineMatrix,
            ITER: [50, 10]
        }, function(output) {
            var probability = _.map(timelineData, function(it, i) {
                return {
                    date: it.date,
                    value: (output.Z[i] * 100)
                };
            });
            graphData.push({
                name: 'Event Probability',
                type: 'bar',
                color: '#000000',
                data: probability
            });
            $scope.$apply(function() {
                $scope.active.displayEventProbabilities = true;
            });
            $scope.chart.updateGranularity($scope.active.granularity);
            $scope.chart.render($scope.data);
            $scope.chart.renderExtent($scope.extent);
        }).fail(function() {
            // If the request fails, then just update.
            $scope.$apply();
        });
    };

    var addStl2TimeSeriesAnalysis = function(timelineData, graphData) {
        // The analysis code just wants an array of the counts
        var timelineVector = _.map(timelineData, function(it) {
            return it.value;
        });

        var periodLength = 1;
        var seasonWindow = 1;
        var trendWindow = 1;
        if($scope.active.granularity === $scope.active.DAY) {
            // At the day granularity, look for weekly patterns
            periodLength = 7;
            seasonWindow = 31;
            trendWindow = 41;
        } else if($scope.active.granularity === $scope.active.HOUR) {
            // At the hourly granularity, look for daily patterns
            periodLength = 24;
            seasonWindow = 24 * 7 * 2;
            trendWindow = 24 * 30;
        } else {
            return;
        }
        ocpu.rpc("nstl2", {
            x: timelineVector,
            "n.p": periodLength, // specifies seasonal periodicity
            "t.degree": 2, "t.window": 41, // trend smoothing parameters
            "s.window": seasonWindow, "s.degree": 2, // seasonal smoothing parameters
            outer: 10 // number of robustness iterations
        }, function(output) {
            // Square the trend data so that it is on the same scale as the counts
            var trend = _.map(timelineData, function(it, i) {
                return {
                    date: it.date, value: output[i].trend
                };
            });
            graphData.push({
                name: 'Trend',
                type: 'line',
                color: '#ff7f0e',
                data: trend
            });
            var seasonal = _.map(timelineData, function(it, i) {
                return {
                    date: it.date, value: output[i].seasonal
                };
            });
            graphData.push({
                name: 'Seasonal',
                type: 'line',
                color: '#3333C2',
                data: seasonal
            });
            // Square the remainder data so that it is on the same scale as the counts
            var remainder = _.map(timelineData, function(it, i) {
                return {
                    date: it.date, value: output[i].remainder
                };
            });
            graphData.push({
                name: 'Remainder',
                type: 'bar',
                color: '#C23333',
                data: remainder
            });
            $scope.$apply();
        }).fail(function() {
            // If the request fails, then just update.
            $scope.$apply();
        });
    };

    var addAnomalyDetectionAnalysis = function(timelineData, graphData) {
        var timelineDataFrame = _.map(timelineData, function(it) {
            var dateString = it.date.getUTCFullYear() + "-" +
                (it.date.getUTCMonth() + 1) + "-" +
                it.date.getUTCDate() + " " +
                it.date.getUTCHours() + ":" +
                it.date.getUTCMinutes() + ":" +
                it.date.getUTCSeconds();
            return {
                timestamp: dateString,
                count: it.value
            };
        });
        ocpu.rpc("nAnomalyDetectionTs", {
            data: timelineDataFrame
        }, function(anomalies) {
            // The result is an array of anomolies, where each anomaly has the form:
            // {
            //   anoms: 105,
            //   timestamp: "2015-11-05 13:00:00"
            // }
            // If there are no anomalies, the array will be empty
            if(anomalies.length === 0) {
                return;
            }

            var mainData = graphData[0].data;
            var anomalyIndex = 0;
            var anomalyDate = null;
            var dataIndex = 0;
            var dataDate = null;
            // Both the plain data and the anomalies are in sorted order, so iterate over
            // both of them simultaneously
            while(dataIndex < mainData.length && anomalyIndex < anomalies.length) {
                // Only recalculate the date if the index is changed. This is particularly
                // relevant for the anomalyDate because it is more expensive to compute, and
                // it should be unchanged for the vast majority of iterations of this loop.
                if(anomalyDate === null) {
                    anomalyDate = new Date(anomalies[anomalyIndex].timestamp + " UTC");
                }
                if(dataDate === null) {
                    dataDate = mainData[dataIndex].date;
                }
                // If there's a match, mark the data. Otherwise, advance the index in the
                // array that has the lesser date.
                if(anomalyDate.getTime() === mainData[dataIndex].date.getTime()) {
                    mainData[dataIndex].anomaly = true;
                    ++dataIndex;
                    dataDate = null;
                    ++anomalyIndex;
                    anomalyDate = null;
                } else if(anomalyDate.getTime() < dataDate.getTime()) {
                    // If the anomaly is older than the data, then try the next anomaly
                    ++anomalyIndex;
                    anomalyDate = null;
                } else {
                    // The data must be older than the anomaly, so go to the next entry in
                    // the data
                    ++dataIndex;
                    dataDate = null;
                }
            }
            $scope.$apply();
        }).fail(function() {
            // If the request fails, then just update.
            $scope.$apply();
        });
    };

    /**
     * Removes the timeline extent and filter.
     * @method removeFilter
     */
    $scope.removeFilter = function() {
        if($scope.bucketizer.getStartDate() && $scope.bucketizer.getEndDate()) {
            setDateTimePickerStart($scope.bucketizer.getStartDate());
            setDateTimePickerEnd($scope.bucketizer.getEndDate());
        }
        $scope.functions.removeNeonFilter();
    };

    $scope.handleChangeDateField = function() {
        $scope.functions.logChangeAndUpdate("dateField", $scope.active.dateField.columnName);
    };

    $scope.functions.createExportDataObject = function(exportId, query) {
        var finalObject = {
            name: "Timeline",
            data: [{
                query: query,
                name: "timeline-" + exportId,
                fields: [],
                ignoreFilters: query.ignoreFilters_,
                selectionOnly: query.selectionOnly_,
                ignoredFilterIds: query.ignoredFilterIds_,
                type: "query"
            }]
        };
        // The timelineSelector always asks for count and date, so it's fine to hard-code these in.
        // GroupBy clauses will always be added to the query in the same order, so this takes advantage
        // of that to add the pretty names of the clauses in the same order for as many as were added.
        // TODO NEON-1973
        /*
        var counter = 0;
        var prettyNames = ["Year", "Month", "Day", "Hour"];
        query.groupByClauses.forEach(function(field) {
            finalObject.data[0].fields.push({
                query: field.name,
                pretty: prettyNames[counter]
            });
            counter++;
        });
        */
        finalObject.data[0].fields.push({
            query: "count",
            pretty: "Count"
        });
        return finalObject;
    };

    $scope.functions.addToBindings = function(bindings) {
        bindings.dateField = $scope.functions.isFieldValid($scope.active.dateField) ? $scope.active.dateField.columnName : undefined;
        bindings.granularity = $scope.active.granularity || undefined;
        return bindings;
    };

    $scope.functions.createMenuText = function() {
        return ($scope.active.numberValid || "No") + " Valid Records" + ($scope.active.numberInvalid ? "(" + $scope.active.numberInvalid + " Invalid)" : "");
    };

    $scope.functions.showMenuText = function() {
        return $scope.active.numberValid || $scope.active.numberInvalid;
    };

    $scope.functions.hideHeaders = function() {
        return false;
    };

    $scope.getLinksPopupDateKey = function() {
        if($scope.active.startDateForDisplay && $scope.active.endDateForDisplay) {
            return $scope.functions.getLinksPopupService().generateDateRangeKey($scope.active.startDateForDisplay, $scope.active.endDateForDisplay);
        }
        return "";
    };

    $scope.getFilterData = function() {
        return $scope.showInvalidDatesFilter ? ["All Invalid Dates"] : ($scope.extent.length ? ["Date Filter"] : []);
    };

    $scope.getFilterDesc = function() {
        return $scope.showInvalidDatesFilter ? "All Invalid Dates" : "Date from " + $scope.active.startDateForDisplay + " to " + $scope.active.endDateForDisplay;
    };

    $scope.getFilterText = function(value) {
        return value;
    };
}]);
