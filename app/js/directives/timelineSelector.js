'use strict';
/*
 * Copyright 2014 Next Century Corporation
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

/**
 * This Angular JS directive adds a timeline selector to a page.  The timeline selector uses the
 * Neon API to query the currently selected data source the number of records matched by current
 * Neon filters.  These records are binned by time interval to display the number of records
 * available temporally.  Additionally, the timeline includes a brushing tool that allows a user to
 * select a time range.  The time range is set as a Neon selection filter which will limit the
 * records displayed by any visualization that filters their datasets with the active selection.
 *
 * @example
 *    &lt;timeline-selector&gt;&lt;/timeline-selector&gt;<br>
 *    &lt;div timeline-selector&gt;&lt;/div&gt;
 *
 * @namespace neonDemo.directives
 * @class timelineSelector
 * @constructor
 */
angular.module('neonDemo.directives')
.directive('timelineSelector', ['$interval', '$filter', 'external', 'popups', 'ConnectionService', 'DatasetService', 'ErrorNotificationService', 'FilterService', 'ExportService', 'opencpu',
function($interval, $filter, external, popups, connectionService, datasetService, errorNotificationService, filterService, exportService, opencpu) {
    return {
        templateUrl: 'partials/directives/timelineSelector.html',
        restrict: 'EA',
        scope: {
            bindTitle: '=',
            bindDateField: '=',
            bindTable: '=',
            bindDatabase: '=',
            bindGranularity: '=',
            hideHeader: '=?',
            hideAdvancedOptions: '=?',
            overrideStartDate: '=?',
            overrideEndDate: '=?'
        },
        link: function($scope, $element) {
            var YEAR = "year";
            var MONTH = "month";
            var HOUR = "hour";
            var DAY = "day";

            $element.addClass('timeline-selector');
            $scope.visualizationId = "timeline-" + uuid();

            $scope.element = $element;
            $scope.opencpu = opencpu;

            // Default our time data to an empty array.
            $scope.data = [];
            $scope.brush = [];
            $scope.extentDirty = false;
            $scope.dayHourBucketizer = dateBucketizer();
            $scope.monthBucketizer = monthBucketizer();
            $scope.yearBucketizer = yearBucketizer();
            $scope.bucketizer = $scope.dayHourBucketizer;
            $scope.startDateForDisplay = undefined;
            $scope.endDateForDisplay = undefined;
            $scope.referenceStartDate = undefined;
            $scope.referenceEndDate = undefined;

            $scope.recordCount = 0;
            $scope.invalidRecordCount = 0;
            $scope.eventProbabilitiesDisplayed = false;
            $scope.errorMessage = undefined;
            $scope.loadingData = false;
            $scope.noData = true;
            $scope.invalidDatesFilter = false;
            $scope.width = 0;

            $scope.databases = [];
            $scope.tables = [];
            $scope.fields = [];
            $scope.visualizationFilterKeys = {};
            $scope.filterKeys = {};
            $scope.filter = {
                start: undefined,
                end: undefined
            };

            $scope.outstandingQuery = undefined;

            $scope.options = {
                database: {},
                table: {},
                dateField: "",
                primarySeries: false,
                collapsed: true,
                granularity: DAY,
                showFocus: "on_filter",
                animatingTime: false,
                animationFrame: 0,
                animationFrameDelay: 250,
                showAnimationControls: false
            };

            var datesEqual = function(a, b) {
                return a.toUTCString() === b.toUTCString();
            };

            var getDateTimePickerStart = function() {
                return new Date(Date.UTC($scope.filter.start.getFullYear(), $scope.filter.start.getMonth(), $scope.filter.start.getDate(), $scope.filter.start.getHours()));
            };

            var getDateTimePickerEnd = function() {
                return new Date(Date.UTC($scope.filter.end.getFullYear(), $scope.filter.end.getMonth(), $scope.filter.end.getDate() + 1, $scope.filter.end.getHours()));
            };

            var setDateTimePickerStart = function(date) {
                $scope.filter.start = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours());
            };

            var setDateTimePickerEnd = function(date) {
                $scope.filter.end = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - 1, date.getUTCHours());
            };

            /**
             * Begins an animation loop by calling doTimeAnimation() at regular intervals.  An animation
             * consists of separate events for each bucket of time data at the timeline selector's current
             * time resolution.  On each animation tick, a date-selected event will be emitted to allow
             * other visualization to respond to the animation loop with their own customized graphics or filtered data.
             * @method playTimeAnimation
             */
            $scope.playTimeAnimation = function() {
                $scope.options.animatingTime = true;
                $scope.options.animationTimeout = $interval($scope.doTimeAnimation, $scope.options.animationFrameDelay);
            };

            /**
             * Pauses an animation loop by cancelling the automatic doTimeAnimation interval.
             * @method pauseTimeAnimation
             */
            $scope.pauseTimeAnimation = function() {
                $interval.cancel($scope.options.animationTimeout);
                $scope.options.animatingTime = false;
            };

            /**
             * Stops an animation loop by cancelling the automatic doTimeAnimation interval and resetting the
             * animation frame.
             * @method stopTimeAnimation
             */
            $scope.stopTimeAnimation = function() {
                $interval.cancel($scope.options.animationTimeout);
                $scope.options.animatingTime = false;

                // Clear the current step data.
                $scope.options.animationFrame = 0;
                $scope.messenger.publish('date_selected', {});
            };

            /**
             * Step ahead one frame of animation.  This emits a selection of the next bucket of temporal data.
             * @method stepTimeAnimation
             */
            $scope.stepTimeAnimation = function() {
                if($scope.options.animatingTime) {
                    $scope.pauseTimeAnimation();
                }
                $scope.doTimeAnimation();
            };

            /**
             * Get the animation frame for the first non-empty bucket within our brushed time range, or simply
             * the first non-empty time bucket if no brush exists.
             * @method getAnimationStartFrame
             */
            $scope.getAnimationStartFrame = function() {
                var origStartBucketIndex = ($scope.brush.length && $scope.brush[0]) ?
                    $scope.bucketizer.getBucketIndex($scope.brush[0]) : 0;

                var indexLimit = ($scope.brush.length && $scope.brush[1]) ?
                    $scope.bucketizer.getBucketIndex($scope.brush[1]) : $scope.bucketizer.getNumBuckets();

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

                var dateData = _.find($scope.options.primarySeries.data, {
                    date: $scope.bucketizer.getDateForBucket(bucketIndex)
                });

                if(dateData && dateData.value > 0) {
                    return bucketIndex;
                }

                return nextNonEmptyDate(bucketIndex + 1, indexLimit);
            };

            /**
             * Get the animation frame limit for the brushed time range, or simply
             * the overall frame limit if no brush exists.
             * @method getAnimationFrameLimit
             */
            $scope.getAnimationFrameLimit = function() {
                var origFrameLimit = ($scope.brush.length && $scope.brush[1]) ?
                    $scope.bucketizer.getBucketIndex($scope.brush[1]) : $scope.bucketizer.getNumBuckets();

                var indexMin = ($scope.brush.length && $scope.brush[0]) ?
                    $scope.bucketizer.getBucketIndex($scope.brush[0]) : 0;

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

                var dateData = _.find($scope.options.primarySeries.data, {
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
                var frameStart = $scope.getAnimationStartFrame();
                var frameLimit = $scope.getAnimationFrameLimit();
                if(($scope.options.animationFrame >= frameLimit) || ($scope.options.animationFrame < frameStart)) {
                    $scope.options.animationFrame = frameStart;
                }

                // Get the time range for the current animation frame and publish it.
                var dateSelected = {
                    start: $scope.bucketizer.getDateForBucket($scope.options.animationFrame),
                    end: $scope.bucketizer.getDateForBucket($scope.options.animationFrame + 1)
                };

                // Cleanup the animation end time on the last frame.
                if($scope.options.animationFrame === ($scope.bucketizer.getNumBuckets() - 1)) {
                    dateSelected.end = $scope.bucketizer.getEndDate();
                }

                $scope.messenger.publish('date_selected', dateSelected);

                // Advance the animation step data.
                $scope.options.animationFrame++;
            };

            $scope.handleDateTimePickChange = function() {
                // Convert the datetimepicker dates from UTC to local time to match the other dates used throughout the application.
                var start = getDateTimePickerStart();
                var end = getDateTimePickerEnd();

                if($scope.brush.length && datesEqual(start, $scope.brush[0]) && datesEqual(end, $scope.brush[1])) {
                    $element.find(".save-button").addClass("disabled");
                } else if(!$scope.brush.length && datesEqual(start, $scope.bucketizer.getStartDate()) && datesEqual(end, $scope.bucketizer.getEndDate())) {
                    $element.find(".save-button").addClass("disabled");
                } else {
                    $element.find(".save-button").removeClass("disabled");
                }
            };

            $scope.handleDateTimePickSave = function() {
                // Convert the datetimepicker dates from UTC to local time to match the other dates used throughout the application.
                var start = getDateTimePickerStart();
                var end = getDateTimePickerEnd();

                $element.find(".save-button").addClass("disabled");
                $element.find(".neon-datetimepicker").removeClass("open");

                if(datesEqual(start, $scope.bucketizer.getStartDate()) && datesEqual(end, $scope.bucketizer.getEndDate())) {
                    if($scope.brush.length) {
                        $scope.clearBrush();
                    }
                    return;
                }

                $scope.brush = [start, end];
                $scope.extentDirty = true;
            };

            $scope.handleDateTimePickCancel = function() {
                if($scope.brush.length) {
                    setDateTimePickerStart($scope.brush[0]);
                    setDateTimePickerEnd($scope.brush[1]);
                } else if($scope.bucketizer.getStartDate() && $scope.bucketizer.getEndDate()) {
                    setDateTimePickerStart($scope.bucketizer.getStartDate());
                    setDateTimePickerEnd($scope.bucketizer.getEndDate());
                }

                $element.find(".save-button").addClass("disabled");
                $element.find(".neon-datetimepicker").removeClass("open");
            };

            /**
             * Update any book-keeping fields that need to change when the granularity changes.
             */
            $scope.updateBucketizer = function() {
                if($scope.options.granularity === MONTH) {
                    $scope.bucketizer = $scope.monthBucketizer;
                } else if($scope.options.granularity === YEAR) {
                    $scope.bucketizer = $scope.yearBucketizer;
                } else {
                    $scope.bucketizer = $scope.dayHourBucketizer;
                    $scope.bucketizer.setGranularity($scope.options.granularity);
                }
            };

            /**
             * Updates the starts/end dates based on the chart granularity
             */
            $scope.updateDates = function() {
                // Updates depend on having valid reference dates which may not be the case during
                // directive initialization
                if($scope.referenceStartDate && $scope.referenceEndDate) {
                    $scope.bucketizer.setStartDate($scope.bucketizer.zeroOutDate($scope.referenceStartDate));
                    var endDateBucket = $scope.bucketizer.getBucketIndex($scope.referenceEndDate);
                    var afterEndDate = $scope.bucketizer.getDateForBucket(endDateBucket + 1);
                    $scope.bucketizer.setEndDate(afterEndDate);
                    setDateTimePickerStart($scope.bucketizer.getStartDate());
                    setDateTimePickerEnd($scope.bucketizer.getEndDate());
                    $scope.messenger.publish('date_bucketizer', {
                        bucketizer: $scope.bucketizer
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
                $scope.startDateForDisplay = $scope.formatStartDate(displayStartDate);
                $scope.endDateForDisplay = $scope.formatEndDate(displayEndDate);
                if(external.services.date) {
                    var dateLinks = [];
                    Object.keys(external.services.date.apps).forEach(function(app) {
                        dateLinks.push(popups.links.createServiceLinkObjectWithData(external.services.date, app, {
                            startDate: displayStartDate.toISOString(),
                            endDate: displayEndDate.toISOString()
                        }));
                    });
                    var timelineLinks = {};
                    timelineLinks[$scope.getDateKeyForLinksPopupButton()] = dateLinks;
                    popups.links.setData($scope.visualizationId, timelineLinks);
                }
            };

            /**
             * Clears the display dates.
             * @method clearDisplayDates
             * @private
             */
            var clearDisplayDates = function() {
                $scope.startDateForDisplay = undefined;
                $scope.endDateForDisplay = undefined;
                popups.links.deleteData($scope.visualizationId);
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
                if($scope.options.granularity !== HOUR) {
                    formattedEndDate = new Date(formattedEndDate.getTime() - 1);
                }
                var format = $scope.bucketizer.getDateFormat();
                formattedEndDate = $filter("date")(formattedEndDate.toISOString(), format);
                return formattedEndDate;
            };

            $scope.getDateKeyForLinksPopupButton = function() {
                return $scope.startDateForDisplay && $scope.endDateForDisplay ? popups.links.generateRangeKey($scope.startDateForDisplay, $scope.endDateForDisplay) : "";
            };

            /**
             * Add a Neon groupBy clause that provides the necessary grouping for the current
             * granularity
             * @param {Object} query the query to add the group by clause to
             */
            $scope.addGroupByGranularityClause = function(query) {
                var yearGroupClause = new neon.query.GroupByFunctionClause(neon.query.YEAR, $scope.options.dateField.columnName, 'year');
                var monthGroupClause = new neon.query.GroupByFunctionClause(neon.query.MONTH, $scope.options.dateField.columnName, 'month');
                var dayGroupClause = new neon.query.GroupByFunctionClause(neon.query.DAY, $scope.options.dateField.columnName, 'day');
                var hourGroupClause = new neon.query.GroupByFunctionClause(neon.query.HOUR, $scope.options.dateField.columnName, 'hour');

                // Group by the appropriate granularity.
                if($scope.options.granularity === YEAR) {
                    query.groupBy(yearGroupClause);
                } else if($scope.options.granularity === MONTH) {
                    query.groupBy(yearGroupClause, monthGroupClause);
                } else if($scope.options.granularity === DAY) {
                    query.groupBy(yearGroupClause, monthGroupClause, dayGroupClause);
                } else if($scope.options.granularity === HOUR) {
                    query.groupBy(yearGroupClause, monthGroupClause, dayGroupClause, hourGroupClause);
                }
            };

            var onResize = function() {
                var titleWidth = $element.width() - $element.find(".chart-options").outerWidth(true);
                $element.find(".next-to-title").each(function() {
                    titleWidth -= $(this).outerWidth(true);
                });
                $element.find(".title").css("maxWidth", titleWidth - 20);

                resizeDateTimePickerDropdown();

                $scope.width = $element.outerWidth(true);
            };

            var resizeDateTimePickerDropdown = function() {
                var headerHeight = 0;
                $element.find(".header-container").each(function() {
                    headerHeight += $(this).outerHeight(true);
                });
                var height = $element.height() - headerHeight;
                $element.find(".dropdown-menu").css("max-height", height + "px");
            };

            /**
             * Initializes the name of the date field used to query the current dataset
             * and the Neon Messenger used to monitor data change events.
             * @method initialize
             */
            $scope.initialize = function() {
                if($scope.bindGranularity) {
                    $scope.options.granularity = $scope.bindGranularity.toLowerCase();
                    $scope.updateBucketizer();
                }

                $element.find(".neon-datetimepicker").on("hide.bs.dropdown", function() {
                    return false;
                });

                $element.resize(onResize);
                onResize();

                // Switch bucketizers when the granularity is changed.
                $scope.$watch('options.granularity', function(newVal, oldVal) {
                    if(!$scope.loadingData && newVal && newVal !== oldVal) {
                        XDATA.userALE.log({
                            activity: "alter",
                            action: ($scope.loadingData) ? "reset" : "click",
                            elementId: "timeline-" + newVal,
                            elementType: "button",
                            elementSub: "timeline-" + newVal,
                            elementGroup: "chart_group",
                            source: ($scope.loadingData) ? "system" : "user",
                            tags: ["timeline", "granularity", newVal]
                        });
                        clearDisplayDates();
                        $scope.updateBucketizer();

                        $scope.updateDates();

                        if(0 < $scope.brush.length) {
                            var newBrushStart = $scope.bucketizer.roundDownBucket($scope.brush[0]);
                            var newBrushEnd = $scope.bucketizer.roundUpBucket($scope.brush[1]);

                            if(newBrushStart.getTime() !== $scope.brush[0].getTime() || newBrushEnd.getTime() !== $scope.brush[1].getTime()) {
                                $scope.brush = [newBrushStart, newBrushEnd];
                            }
                            resetAndQueryForChartData();
                        } else {
                            resetAndQueryForChartData();
                        }
                    }
                });

                // Watch for brush changes and set the appropriate neon filter.
                $scope.$watch('brush', function(newVal) {
                    if(newVal.length && $scope.messenger && connectionService.getActiveConnection()) {
                        if(2 > newVal.length || newVal[0].getTime() === newVal[1].getTime()) {
                            // may be undefined when a new dataset is being loaded
                            if($scope.bucketizer.getStartDate() !== undefined && $scope.bucketizer.getEndDate() !== undefined && $scope.brush.length) {
                                removeBrushFromTimelineAndDatasetService();
                            }
                            return;
                        }

                        if($scope.brush[0] < $scope.bucketizer.getStartDate()) {
                            $scope.brush[0] = $scope.bucketizer.getStartDate();
                        }
                        if($scope.brush[1] > $scope.bucketizer.getEndDate()) {
                            $scope.brush[1] = $scope.bucketizer.getEndDate();
                        }

                        if(datesEqual($scope.brush[0], $scope.bucketizer.getStartDate()) && datesEqual($scope.brush[1], $scope.bucketizer.getEndDate())) {
                            removeBrushFromTimelineAndDatasetService();
                            return;
                        }

                        // Needed to redraw the brush for the case in which the user clicks on a point inside an existing brush.
                        $scope.extentDirty = true;

                        setDateTimePickerStart($scope.brush.length ? $scope.brush[0] : $scope.bucketizer.getStartDate());
                        setDateTimePickerEnd($scope.brush.length ? $scope.brush[1] : $scope.bucketizer.getEndDate());

                        if($scope.loadingData) {
                            // If the brush changed because of a granularity change, then don't
                            // update the chart. The granularity change will cause the data to be
                            // updated
                            replaceDateFilters(false);
                        } else {
                            // Because the timeline ignores its own filter, we just need to update the
                            // chart times and total when this filter is applied
                            replaceDateFilters(false, $scope.updateChartTimesAndTotal);
                        }
                    }
                }, true);

                $scope.$watch('options.showFocus', function(newVal, oldVal) {
                    if(!$scope.loadingData && newVal && newVal !== oldVal) {
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "click",
                            elementId: "timeline",
                            elementType: "button",
                            elementSub: "timeline-showFocus-" + newVal,
                            elementGroup: "chart_group",
                            source: "user",
                            tags: ["timeline", "showFocus", newVal]
                        });
                    }
                });

                $scope.messenger = new neon.eventing.Messenger();

                $scope.messenger.events({
                    filtersChanged: onFiltersChanged
                });
                $scope.messenger.subscribe(datasetService.UPDATE_DATA_CHANNEL, function() {
                    queryForChartData();
                });
                $scope.messenger.subscribe(datasetService.DATE_CHANGED_CHANNEL, onDateChanged);

                $scope.messenger.subscribe(filterService.REQUEST_REMOVE_FILTER, function(ids) {
                    if(filterService.containsKey($scope.filterKeys, ids)) {
                        removeBrushFromTimelineAndDatasetService();
                    }
                });

                $scope.exportID = exportService.register($scope.makeTimelineSelectorExportObject);

                $scope.$on('$destroy', function() {
                    XDATA.userALE.log({
                        activity: "remove",
                        action: "remove",
                        elementId: "timeline",
                        elementType: "canvas",
                        elementSub: "timeline",
                        elementGroup: "chart_group",
                        source: "system",
                        tags: ["remove", "timeline"]
                    });
                    popups.links.deleteData($scope.visualizationId);
                    $scope.messenger.removeEvents();
                    // Remove our filter if we had an active one.
                    if($scope.brush.length) {
                        filterService.removeFilters($scope.messenger, $scope.filterKeys);
                    }
                    exportService.unregister($scope.exportID);
                    $element.off("resize", onResize);
                });
            };

            /**
             * If this timeline's brush extent does not match the brush extent saved in the Dataset Service, replace the date filters on this timeline's date
             * field and all related fields and save the brush extent in the Dataset Service for each field.
             * @param {boolean} showInvalidDates If set to true, filters on invalid dates instead of the brush extent.
             * @param {Function} callback A function to be called after date filters are replaced.  Ignored if the date filters do not need to be updated.
             * @methd replaceDateFilters
             */
            var replaceDateFilters = function(showInvalidDates, callback) {
                if(($scope.brush === datasetService.getDateBrushExtent($scope.options.database.name, $scope.options.table.name, $scope.options.dateField.columnName)) && !showInvalidDates) {
                    return;
                }

                var relations = datasetService.getRelations($scope.options.database.name, $scope.options.table.name, [$scope.options.dateField.columnName]);

                var filterText = $scope.formatStartDate(getFilterStartDate()) + " to " + $scope.formatEndDate(getFilterEndDate());

                if(showInvalidDates) {
                    filterText = "Invalid Dates";
                }

                var filterNameObj = {
                    visName: "Timeline",
                    text: filterText
                };

                filterService.replaceFilters($scope.messenger, relations, $scope.filterKeys, (showInvalidDates ? $scope.createFilterClauseForInvalidDates : $scope.createFilterClauseForDate), filterNameObj, function() {
                    if(callback) {
                        callback();
                    }
                    datasetService.setDateBrushExtentForRelations(relations, $scope.brush);
                });
            };

            /**
             * Replaces all filters with a new one for invalid dates. This results in no data being shown on the timeline.
             * @method sendInvalidDates
             */
            $scope.sendInvalidDates = function() {
                $scope.clearBrush();
                $scope.invalidDatesFilter = true;
                replaceDateFilters(true, queryForChartData);
            };

            /**
             * Clears the invalid dates filter and re-queries.
             * @method clearInvalidDatesFilter
             */
            $scope.clearInvalidDatesFilter = function() {
                $scope.invalidDatesFilter = false;
                filterService.removeFilters($scope.messenger, $scope.filterKeys, queryForChartData);
            };

            /**
             * Creates and returns a filter on the given date field using values greater than Jan. 1, 2025, less than
             * Jan. 1, 1970, or null.
             * @param {Object} databaseAndTableName Contains the database and table name
             * @param {String} dateFieldName The name of the date field on which to filter
             * @method createFilterClauseForInvalidDates
             * @return {Object} A neon.query.Filter object
             */
            $scope.createFilterClauseForInvalidDates = function(databaseAndTableName, dateFieldName) {
                var lowerBoundFilterClause = neon.query.where(dateFieldName, '<', new Date("1970-01-01T00:00:00.000Z"));
                var upperBoundFilterClause = neon.query.where(dateFieldName, '>', new Date("2025-01-01T00:00:00.000Z"));
                var nullFilterClause = neon.query.where(dateFieldName, '=', null);
                var clauses = [lowerBoundFilterClause, upperBoundFilterClause, nullFilterClause];
                return neon.query.or.apply(this, clauses);
            };

            /**
             * Creates and returns a filter on the given date field using the brush extent set by this visualization.
             * @param {Object} databaseAndTableName Contains the database and table name
             * @param {String} dateFieldName The name of the date field on which to filter
             * @method createFilterClauseForDate
             * @return {Object} A neon.query.Filter object
             */
            $scope.createFilterClauseForDate = function(databaseAndTableName, dateFieldName) {
                var startDate = getFilterStartDate();
                var endDate = getFilterEndDate();
                var startFilterClause = neon.query.where(dateFieldName, '>=', startDate);
                var endFilterClause = neon.query.where(dateFieldName, '<', endDate);
                var clauses = [startFilterClause, endFilterClause];
                return neon.query.and.apply(this, clauses);
            };

            var getFilterStartDate = function() {
                var startDate = $scope.brush.length < 2 ? $scope.bucketizer.getStartDate() : $scope.brush[0];
                return $scope.bucketizer.zeroOutDate(startDate);
            };

            var getFilterEndDate = function() {
                var endDate = $scope.brush.length < 2 ? $scope.bucketizer.getEndDate() : $scope.brush[1];
                return $scope.bucketizer.roundUpBucket(endDate);
            };

            /**
             * Returns whether the added or removed filter in the given message is a date filter on this timeline's date field.
             * @param {Object} message
             * @method isDateFiltersChangedMessage
             * @return {Boolean}
             */
            var isDateFiltersChangedMessage = function(message) {
                var whereClauses;
                if(message.addedFilter.whereClause) {
                    whereClauses = message.addedFilter.whereClause.whereClauses;
                } else if(message.removedFilter.whereClause) {
                    whereClauses = message.removedFilter.whereClause.whereClauses;
                }
                if(whereClauses && whereClauses.length === 2 && whereClauses[0].lhs === $scope.options.dateField.columnName && whereClauses[1].lhs === $scope.options.dateField.columnName) {
                    return true;
                }
                return false;
            };

            /**
             * Event handler for filter changed events issued over Neon's messaging channels.
             * @param {Object} message A Neon filter changed message.
             * @method onFiltersChanged
             * @private
             */
            var onFiltersChanged = function(message) {
                if(message.addedFilter && message.addedFilter.databaseName === $scope.options.database.name && message.addedFilter.tableName === $scope.options.table.name) {
                    // If the filter changed event was triggered by a change in the global date filter, ignore the filter changed event.
                    // We don't need to re-query and we'll update the brush extent in response to the date changed event.
                    if(isDateFiltersChangedMessage(message)) {
                        return;
                    }

                    XDATA.userALE.log({
                        activity: "alter",
                        action: "query",
                        elementId: "timeline",
                        elementType: "canvas",
                        elementSub: "timeline",
                        elementGroup: "chart_group",
                        source: "system",
                        tags: ["filter-change", "timeline"]
                    });

                    queryForChartData();
                }
            };

            /**
             * Event handler for date changed events issued over Neon's messaging channels.
             * @param {Object} message A Neon date changed message.
             * @method onDateChanged
             * @private
             */
            var onDateChanged = function(message) {
                if($scope.options.database.name === message.databaseName && $scope.options.table.name === message.tableName) {
                    if(datasetService.isFieldValid($scope.options.dateField) && message.fieldNames.indexOf($scope.options.dateField.columnName) >= 0 && $scope.brush !== message.brushExtent) {
                        $scope.brush = message.brushExtent;
                        $scope.extentDirty = true;
                        $scope.updateChartTimesAndTotal();
                    }
                }
            };

            /**
             * Displays data for any currently active datasets.
             * @param {Boolean} Whether this function was called during visualization initialization.
             * @method displayActiveDataset
             */
            $scope.displayActiveDataset = function(initializing) {
                if(!datasetService.hasDataset() || $scope.loadingData) {
                    return;
                }

                $scope.databases = datasetService.getDatabases();
                $scope.options.database = $scope.databases[0];
                if($scope.bindDatabase) {
                    for(var i = 0; i < $scope.databases.length; ++i) {
                        if($scope.bindDatabase === $scope.databases[i].name) {
                            $scope.options.database = $scope.databases[i];
                            break;
                        }
                    }
                }

                // Create the filter keys for this visualization for each database/table pair in the dataset.
                $scope.visualizationFilterKeys = filterService.createFilterKeys("timeline", datasetService.getDatabaseAndTableNames());
                // The filter keys will be set to the global date filter key for each database/table pair when available and the visualization filter key otherwise.
                $scope.filterKeys = $scope.visualizationFilterKeys;

                if(initializing) {
                    $scope.updateTables();
                } else {
                    $scope.$apply(function() {
                        $scope.updateTables();
                    });
                }
            };

            $scope.updateTables = function() {
                $scope.tables = datasetService.getTables($scope.options.database.name);
                $scope.options.table = datasetService.getFirstTableWithMappings($scope.options.database.name, [neonMappings.DATE]) || $scope.tables[0];
                if($scope.bindTable) {
                    for(var i = 0; i < $scope.tables.length; ++i) {
                        if($scope.bindTable === $scope.tables[i].name) {
                            $scope.options.table = $scope.tables[i];
                            break;
                        }
                    }
                }
                $scope.updateFields();
            };

            $scope.updateFields = function() {
                $scope.loadingData = true;
                $scope.fields = datasetService.getSortedFields($scope.options.database.name, $scope.options.table.name);

                var dateField = $scope.bindDateField || datasetService.getMapping($scope.options.database.name, $scope.options.table.name, neonMappings.DATE) || "date";
                $scope.options.dateField = _.find($scope.fields, function(field) {
                    return field.columnName === dateField;
                }) || datasetService.createBlankField();

                resetAndQueryForChartData();
            };

            var resetAndQueryForChartData = function() {
                $scope.bucketizer.setStartDate(undefined);
                clearDisplayDates();
                $scope.referenceStartDate = undefined;
                $scope.referenceEndDate = undefined;
                $scope.data = [];
                $scope.noData = true;

                var globalBrushExtent = datasetService.isFieldValid($scope.options.dateField) ? datasetService.getDateBrushExtent($scope.options.database.name, $scope.options.table.name, $scope.options.dateField.columnName) : [];
                if($scope.brush !== globalBrushExtent) {
                    $scope.brush = globalBrushExtent;
                    $scope.extentDirty = true;
                }

                // Get the date filter keys for the current database/table/field and change the current filter keys as appropriate.
                if(datasetService.isFieldValid($scope.options.dateField)) {
                    var dateFilterKeys = datasetService.getDateFilterKeys($scope.options.database.name, $scope.options.table.name, $scope.options.dateField.columnName);
                    $scope.filterKeys = filterService.getFilterKeysFromCollections(datasetService.getDatabaseAndTableNames(), $scope.visualizationFilterKeys, dateFilterKeys);
                } else {
                    $scope.filterKeys = $scope.visualizationFilterKeys;
                }

                queryForChartData();
            };

            /**
             * Helper method for queryForChartData() and requestExport(). Creates the Query object to be used by those moethods.
             * @method createChartDataQuery
             * @return {neon.query.Query} query The Query object to be used by queryForChartData() and requestExport()
             */
            $scope.createChartDataQuery = function() {
                var query = new neon.query.Query()
                    .selectFrom($scope.options.database.name, $scope.options.table.name)
                    .where(neon.query.and(
                        neon.query.where($scope.options.dateField.columnName, '>=', new Date("1970-01-01T00:00:00.000Z")),
                        neon.query.where($scope.options.dateField.columnName, '<=', new Date("2025-01-01T00:00:00.000Z"))
                    ));

                $scope.addGroupByGranularityClause(query);

                query.aggregate(neon.query.COUNT, '*', 'count');
                // TODO: Does this need to be an aggregate on the date field? What is MIN doing or is this just an arbitrary function to include the date with the query?
                query.aggregate(neon.query.MIN, $scope.options.dateField.columnName, 'date');
                query.sortBy('date', neon.query.ASCENDING);
                query.ignoreFilters([$scope.filterKeys[$scope.options.database.name][$scope.options.table.name]]);

                return query;
            };

            /**
             * Helper method for queryForChartData(). Creates the Query object for invalid dates to be used by this moethod.
             * @method createInvalidDatesQuery
             * @return {neon.query.Query} query The Query object to be used by queryForChartData()
             */
            $scope.createInvalidDatesQuery = function() {
                var query = new neon.query.Query()
                    .selectFrom($scope.options.database.name, $scope.options.table.name)
                    .where(neon.query.or(
                        neon.query.where($scope.options.dateField.columnName, '<', new Date("1970-01-01T00:00:00.000Z")),
                        neon.query.where($scope.options.dateField.columnName, '>', new Date("2025-01-01T00:00:00.000Z")),
                        neon.query.where($scope.options.dateField.columnName, '=', null)
                    ));

                query.aggregate(neon.query.COUNT, '*', 'count');
                query.ignoreFilters([$scope.filterKeys[$scope.options.database.name][$scope.options.table.name]]);

                return query;
            };

            /**
             * Triggers a Neon query that will aggregate the time data for the currently selected dataset.
             * @method queryForChartData
             */
            var queryForChartData = function() {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                var connection = connectionService.getActiveConnection();

                if(!connection || !datasetService.isFieldValid($scope.options.dateField)) {
                    $scope.updateChartData({
                        data: []
                    });
                    $scope.loadingData = false;
                    return;
                }

                var query = $scope.createChartDataQuery();

                XDATA.userALE.log({
                    activity: "alter",
                    action: "query",
                    elementId: "timeline",
                    elementType: "canvas",
                    elementSub: "timeline",
                    elementGroup: "chart_group",
                    source: "system",
                    tags: ["query", "timeline", "data"]
                });

                if($scope.outstandingQuery) {
                    $scope.outstandingQuery.abort();
                }

                $scope.outstandingQuery = connection.executeQuery(query);
                $scope.outstandingQuery.done(function() {
                    $scope.outstandingQuery = undefined;
                });
                $scope.outstandingQuery.done(function(queryResults) {
                    $scope.$apply(function() {
                        var dateQueryResults = {
                            data: _.filter(queryResults.data, function(datum) {
                                return _.keys(datum).length > 2;
                            })
                        };
                        if($scope.invalidDatesFilter) {
                            dateQueryResults.data = [];
                        }
                        invalidDatesQuery(connection);
                        $scope.updateChartData(dateQueryResults);
                        $scope.loadingData = false;
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "receive",
                            elementId: "timeline",
                            elementType: "canvas",
                            elementSub: "timeline",
                            elementGroup: "chart_group",
                            source: "system",
                            tags: ["receive", "timeline", "data"]
                        });
                    });
                });
                $scope.outstandingQuery.fail(function(response) {
                    if(response.status === 0) {
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "canceled",
                            elementId: "timeline",
                            elementType: "canvas",
                            elementSub: "timeline",
                            elementGroup: "chart_group",
                            source: "system",
                            tags: ["canceled", "timeline", "data"]
                        });
                    } else {
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "failed",
                            elementId: "timeline",
                            elementType: "canvas",
                            elementSub: "timeline",
                            elementGroup: "chart_group",
                            source: "system",
                            tags: ["failed", "timeline", "data"]
                        });
                        $scope.updateChartData({
                            data: []
                        });
                        $scope.invalidRecordCount = 0;
                        $scope.loadingData = false;
                        if(response.responseJSON) {
                            $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                        }
                    }
                });
            };

            /**
             * Triggers a Neon query that will aggregate the invalid dates data for the currently selected dataset.
             * @param {neon.query.Connection} connection
             * @method invalidDatesQuery
             * @private
             */
            var invalidDatesQuery = function(connection) {
                var query = $scope.createInvalidDatesQuery();

                if($scope.outstandingQuery) {
                    $scope.outstandingQuery.abort();
                }

                $scope.outstandingQuery = connection.executeQuery(query);
                $scope.outstandingQuery.done(function() {
                    $scope.outstandingQuery = undefined;
                });
                $scope.outstandingQuery.done(function(queryResults) {
                    $scope.$apply(function() {
                        var invalidDates = _.filter(queryResults.data, function(datum) {
                            return _.keys(datum).length === 2 && datum._id && datum.count;
                        });
                        $scope.invalidRecordCount = (invalidDates.length ? invalidDates[0].count : 0);
                        $scope.loadingData = false;
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "receive",
                            elementId: "timeline",
                            elementType: "canvas",
                            elementSub: "timeline",
                            elementGroup: "chart_group",
                            source: "system",
                            tags: ["receive", "timeline", "data"]
                        });
                    });
                });
                $scope.outstandingQuery.fail(function(response) {
                    if(response.status === 0) {
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "canceled",
                            elementId: "timeline",
                            elementType: "canvas",
                            elementSub: "timeline",
                            elementGroup: "chart_group",
                            source: "system",
                            tags: ["canceled", "timeline", "data"]
                        });
                    } else {
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "failed",
                            elementId: "timeline",
                            elementType: "canvas",
                            elementSub: "timeline",
                            elementGroup: "chart_group",
                            source: "system",
                            tags: ["failed", "timeline", "data"]
                        });
                        $scope.invalidRecordCount = 0;
                        $scope.loadingData = false;
                        if(response.responseJSON) {
                            if($scope.errorMessage) {
                                errorNotificationService.hideErrorMessage($scope.errorMessage);
                                $scope.errorMessage = undefined;
                            }
                            $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                        }
                    }
                });
            };

            /**
             * Updates the chart start/end times to use as a Neon selection and their associated conversion for displaying in
             * UTC. The display value for the total records is updates as well.
             * of the data array.
             * @method updateChartTimesAndTotal
             */
            $scope.updateChartTimesAndTotal = function() {
                // Try to find primary series in new data
                var i = 0;
                var primaryIndex = 0;
                if($scope.options.primarySeries) {
                    for(i = 0; i < $scope.data.length; i++) {
                        if($scope.options.primarySeries.name === $scope.data[i].name) {
                            primaryIndex = i;
                            break;
                        }
                    }
                }
                $scope.options.primarySeries = $scope.data[primaryIndex];

                // Handle bound conditions.

                var extentStartDate;
                var extentEndDate;
                if($scope.brush.length === 2) {
                    extentStartDate = $scope.brush[0];
                    extentEndDate = $scope.brush[1];
                } else {
                    extentStartDate = $scope.bucketizer.getStartDate();
                    extentEndDate = $scope.bucketizer.getEndDate();
                }

                var total = 0;

                if(extentStartDate && extentEndDate) {
                    // can happen when switching between granularities on edge cases
                    if(extentStartDate < $scope.bucketizer.getStartDate()) {
                        extentStartDate = $scope.bucketizer.getStartDate();
                    }

                    if(extentEndDate > $scope.bucketizer.getEndDate()) {
                        extentEndDate = $scope.bucketizer.getEndDate();
                    }

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
                        if($scope.options.primarySeries.data[i]) {
                            total += $scope.options.primarySeries.data[i].value;
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

                $scope.recordCount = total;
            };

            /**
             * Updates the data bound to the chart managed by this directive.  This will trigger a change in
             * the chart's visualization.
             * @param {Object} queryResults Results returned from a Neon query.
             * @param {Array} queryResults.data The aggregate numbers for the heat chart cells.
             * @method updateChartData
             */
            $scope.updateChartData = function(queryResults) {
                // Any time new data is fetched, the old MMPP analysis is invalidated.
                $scope.eventProbabilitiesDisplayed = false;

                if(queryResults.data.length > 0) {
                    var updateDatesCallback = function() {
                        if($scope.bucketizer.getStartDate() === undefined || $scope.bucketizer.getEndDate() === undefined) {
                            $scope.updateDates();
                        }
                        var data = $scope.createTimelineData(queryResults);
                        $scope.data = data;
                        $scope.noData = !$scope.data || !$scope.data.length || !$scope.data[0].data || !$scope.data[0].data.length;
                        $scope.updateChartTimesAndTotal();
                        $scope.addTimeSeriesAnalysis(data[0].data, data);
                    };

                    // on the initial query, setup the start/end bounds
                    if($scope.referenceStartDate === undefined || $scope.referenceEndDate === undefined) {
                        $scope.getMinMaxDates(updateDatesCallback);
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
                    $scope.data = $scope.createTimelineData(queryResults);
                    $scope.noData = !$scope.data || !$scope.data.length || !$scope.data[0].data || !$scope.data[0].data.length;
                    $scope.updateChartTimesAndTotal();
                }
            };

            $scope.getMinMaxDates = function(success) {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                var connection = connectionService.getActiveConnection();

                if($scope.overrideStartDate) {
                    $scope.referenceStartDate = new Date($scope.overrideStartDate);
                } else {
                    // TODO: neon doesn't yet support a more efficient way to just get the min/max fields without aggregating
                    // TODO: This could be done better with a promise framework - just did this in a pinch for a demo
                    var minDateQuery = new neon.query.Query()
                        .selectFrom($scope.options.database.name, $scope.options.table.name).ignoreFilters()
                        .where(neon.query.and(
                            neon.query.where($scope.options.dateField.columnName, '>=', new Date("1970-01-01T00:00:00.000Z")),
                            neon.query.where($scope.options.dateField.columnName, '<=', new Date("2025-01-01T00:00:00.000Z"))
                        ))
                        .sortBy($scope.options.dateField.columnName, neon.query.ASCENDING).limit(1);

                    XDATA.userALE.log({
                        activity: "alter",
                        action: "query",
                        elementId: "timeline",
                        elementType: "canvas",
                        elementSub: "timeline",
                        elementGroup: "chart_group",
                        source: "system",
                        tags: ["query", "timeline", "min-date"]
                    });
                    if(connection) {
                        connection.executeQuery(minDateQuery, function(queryResults) {
                            if(queryResults.data.length > 0) {
                                XDATA.userALE.log({
                                    activity: "alter",
                                    action: "query",
                                    elementId: "timeline",
                                    elementType: "canvas",
                                    elementSub: "timeline",
                                    elementGroup: "chart_group",
                                    source: "system",
                                    tags: ["receive", "timeline", "min-date"]
                                });
                                $scope.referenceStartDate = new Date(queryResults.data[0][$scope.options.dateField.columnName]);
                                if($scope.referenceEndDate !== undefined) {
                                    $scope.$apply(success);
                                }
                            }
                        }, function(response) {
                            XDATA.userALE.log({
                                activity: "alter",
                                action: "query",
                                elementId: "timeline",
                                elementType: "canvas",
                                elementSub: "timeline",
                                elementGroup: "chart_group",
                                source: "system",
                                tags: ["failed", "timeline", "min-date"]
                            });
                            $scope.referenceStartDate = undefined;
                            $scope.updateChartData({
                                data: []
                            });
                            if(response.responseJSON) {
                                $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                            }
                        });
                    }
                }

                if($scope.overrideEndDate) {
                    $scope.referenceEndDate = new Date($scope.overrideEndDate);

                    if($scope.referenceStartDate !== undefined) {
                        success();
                    }
                } else {
                    var maxDateQuery = new neon.query.Query()
                        .selectFrom($scope.options.database.name, $scope.options.table.name).ignoreFilters()
                        .where(neon.query.and(
                            neon.query.where($scope.options.dateField.columnName, '>=', new Date("1970-01-01T00:00:00.000Z")),
                            neon.query.where($scope.options.dateField.columnName, '<=', new Date("2025-01-01T00:00:00.000Z"))
                        ))
                        .sortBy($scope.options.dateField.columnName, neon.query.DESCENDING).limit(1);

                    XDATA.userALE.log({
                        activity: "alter",
                        action: "query",
                        elementId: "timeline",
                        elementType: "canvas",
                        elementSub: "timeline",
                        elementGroup: "chart_group",
                        source: "system",
                        tags: ["query", "timeline", "max-date"]
                    });

                    if(connection) {
                        connection.executeQuery(maxDateQuery, function(queryResults) {
                            if(queryResults.data.length > 0) {
                                XDATA.userALE.log({
                                    activity: "alter",
                                    action: "query",
                                    elementId: "timeline",
                                    elementType: "canvas",
                                    elementSub: "timeline",
                                    elementGroup: "chart_group",
                                    source: "system",
                                    tags: ["received", "timeline", "max-date"]
                                });
                                $scope.referenceEndDate = new Date(queryResults.data[0][$scope.options.dateField.columnName]);
                                if($scope.referenceStartDate !== undefined) {
                                    $scope.$apply(success);
                                }
                            }
                        }, function(response) {
                            XDATA.userALE.log({
                                activity: "alter",
                                action: "query",
                                elementId: "timeline",
                                elementType: "canvas",
                                elementSub: "timeline",
                                elementGroup: "chart_group",
                                source: "system",
                                tags: ["failed", "timeline", "max-date"]
                            });
                            $scope.referenceEndDate = undefined;
                            $scope.updateChartData({
                                data: []
                            });
                            if(response.responseJSON) {
                                $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                            }
                        });
                    }
                }
            };

            /**
             * Creates a new data array used to populate our contained timeline.  This function is used
             * as or by Neon query handlers.
             * @param {Object} queryResults Results returned from a Neon query.
             * @param {Array} queryResults.data The aggregate numbers for the heat chart cells.
             * @method createTimelineData
             */
            $scope.createTimelineData = function(queryResults) {
                var rawData = queryResults.data;
                var data = [];
                var queryData = [];
                var i = 0;
                var rawLength = rawData.length;

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

                    // Fill our rawData into the appropriate interval buckets.
                    var resultDate;
                    for(i = 0; i < rawLength; i++) {
                        resultDate = new Date(rawData[i].date);
                        var bucketIndex = $scope.bucketizer.getBucketIndex(resultDate);
                        if(queryData[bucketIndex]) {
                            queryData[bucketIndex].value = rawData[i].count;
                        }
                    }
                }

                data.push({
                    name: 'Total',
                    type: 'bar',
                    color: '#39b54a',
                    data: queryData
                });

                return data;
            };

            /**
             * Adds the timeseries analysis to the data to be graphed.
             * @param timelineData an array of {date: Date(...), value: n} objects, one for each day
             * @param graphData the array of objects that will be graphed
             */
            $scope.addTimeSeriesAnalysis = function(timelineData, graphData) {
                // If OpenCPU isn't available, then just return without doing anything.
                if(!ocpu.connected) {
                    return;
                }

                if($scope.opencpu.enableStl2) {
                    $scope.addStl2TimeSeriesAnalysis(timelineData, graphData);
                }
                if($scope.opencpu.enableAnomalyDetection) {
                    $scope.addAnomalyDetectionAnalysis(timelineData, graphData);
                }
            };

            $scope.runMMPP = function() {
                if(!ocpu.connected) {
                    return;
                }
                $scope.addMmppTimeSeriesAnalysis($scope.options.primarySeries.data, $scope.data);
            };

            $scope.addMmppTimeSeriesAnalysis = function(timelineData, graphData) {
                // The MMPP analysis needs hourly data
                if($scope.options.granularity !== HOUR) {
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
                        $scope.eventProbabilitiesDisplayed = true;
                    });
                }).fail(function() {
                    // If the request fails, then just update.
                    $scope.$apply();
                });
            };

            $scope.addStl2TimeSeriesAnalysis = function(timelineData, graphData) {
                // The analysis code just wants an array of the counts
                var timelineVector = _.map(timelineData, function(it) {
                    return it.value;
                });

                var periodLength = 1;
                var seasonWindow = 1;
                var trendWindow = 1;
                if($scope.options.granularity === DAY) {
                    // At the day granularity, look for weekly patterns
                    periodLength = 7;
                    seasonWindow = 31;
                    trendWindow = 41;
                } else if($scope.options.granularity === HOUR) {
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

            $scope.addAnomalyDetectionAnalysis = function(timelineData, graphData) {
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
             * Removes the brush from this visualization and the dataset service.
             */
            var removeBrushFromTimelineAndDatasetService = function() {
                $scope.brush = [];
                $scope.extentDirty = true;
                if($scope.bucketizer.getStartDate() && $scope.bucketizer.getEndDate()) {
                    setDateTimePickerStart($scope.bucketizer.getStartDate());
                    setDateTimePickerEnd($scope.bucketizer.getEndDate());
                }
                var relations = datasetService.getRelations($scope.options.database.name, $scope.options.table.name, [$scope.options.dateField.columnName]);
                filterService.removeFilters($scope.messenger, $scope.filterKeys, function() {
                    datasetService.removeDateBrushExtentForRelations(relations);
                });
            };

            /**
             * Clears the timeline brush and filter.
             * @method clearBrush
             */
            $scope.clearBrush = function() {
                XDATA.userALE.log({
                    activity: "deselect",
                    action: "click",
                    elementId: "timeline-clear-range",
                    elementType: "button",
                    elementGroup: "chart_group",
                    source: "user",
                    tags: ["filter", "date-range"]
                });

                removeBrushFromTimelineAndDatasetService();
            };

            $scope.updateDateField = function() {
                // TODO Logging
                if(!$scope.loadingData) {
                    resetAndQueryForChartData();
                }
            };

            /**
             * Creates and returns an object that contains information needed to export the data in this widget.
             * @return {Object} An object containing all the information needed to export the data in this widget.
             */
            $scope.makeTimelineSelectorExportObject = function() {
                XDATA.userALE.log({
                    activity: "perform",
                    action: "click",
                    elementId: "timeline-export",
                    elementType: "button",
                    elementGroup: "chart_group",
                    source: "user",
                    tags: ["options", "timeline", "export"]
                });
                var query = $scope.createChartDataQuery();
                query.limitClause = exportService.getLimitClause();
                query.ignoreFilters_ = exportService.getIgnoreFilters();
                query.ignoredFilterIds_ = exportService.getIgnoredFilterIds();
                var finalObject = {
                    name: "Timeline",
                    data: [{
                        query: query,
                        name: "timelineSelector-" + $scope.exportID,
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
                var counter = 0;
                var prettyNames = ["Year", "Month", "Day", "Hour"];
                query.groupByClauses.forEach(function(field) {
                        finalObject.data[0].fields.push({
                            query: field.name,
                            pretty: prettyNames[counter]
                        });
                        counter++;
                    }
                );
                finalObject.data[0].fields.push({
                    query: "count",
                    pretty: "Count"
                });
                return finalObject;
            };

            // Wait for neon to be ready, the create our messenger and intialize the view and data.
            neon.ready(function() {
                $scope.initialize();
                $scope.displayActiveDataset(true);
            });
        }
    };
}]);
