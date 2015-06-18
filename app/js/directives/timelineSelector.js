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
.directive('timelineSelector', ['ConnectionService', 'DatasetService', 'ErrorNotificationService', 'FilterService',
function(connectionService, datasetService, errorNotificationService, filterService) {
    return {
        templateUrl: 'partials/directives/timelineSelector.html',
        restrict: 'EA',
        scope: {
            bindDateField: '=',
            bindTable: '=',
            bindDatabase: '=',
            hideHeader: '=?',
            hideAdvancedOptions: '=?'
        },
        link: function($scope, $element) {
            var YEAR = "year";
            var MONTH = "month";
            var HOUR = "hour";
            var DAY = "day";

            $element.addClass('timeline-selector');

            $scope.element = $element;

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
            $scope.filterId = 'timelineFilter' + uuid();
            $scope.eventProbabilitiesDisplayed = false;
            $scope.errorMessage = undefined;
            $scope.loadingData = false;

            $scope.databases = [];
            $scope.tables = [];
            $scope.fields = [];
            $scope.filterKeys = {};

            $scope.options = {
                database: {},
                table: {},
                dateField: "",
                primarySeries: false,
                collapsed: true,
                granularity: DAY
            };

            /**
             * Update any book-keeping fields that need to change when the granularity changes.
             * @param {String} the constant for the new granularity
             */
            $scope.setGranularity = function(newGranularity) {
                if(newGranularity === MONTH) {
                    $scope.bucketizer = $scope.monthBucketizer;
                } else if(newGranularity === YEAR) {
                    $scope.bucketizer = $scope.yearBucketizer;
                } else {
                    $scope.bucketizer = $scope.dayHourBucketizer;
                    $scope.bucketizer.setGranularity(newGranularity);
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
                }
            };

            /**
             * Sets the display dates, that are used by the template, to the provided values.
             */
            $scope.setDisplayDates = function(displayStartDate, displayEndDate) {
                $scope.startDateForDisplay = new Date(displayStartDate.getUTCFullYear(),
                    displayStartDate.getUTCMonth(),
                    displayStartDate.getUTCDate(),
                    displayStartDate.getUTCHours());
                $scope.endDateForDisplay = new Date(displayEndDate.getUTCFullYear(),
                    displayEndDate.getUTCMonth(),
                    displayEndDate.getUTCDate(),
                    displayEndDate.getUTCHours());
                // Describing ranges is odd. If an event lasts 2 hours starting at 6am, then it
                // lasts from 6am to 8am. But if an event starts on the 6th and lasts 2 days, then
                // it lasts from the 6th to the 7th.
                if($scope.options.granularity !== HOUR) {
                    $scope.endDateForDisplay = new Date($scope.endDateForDisplay.getTime() - 1);
                }
            };

            /**
             * Add a Neon groupBy clause that provides the necessary grouping for the current
             * granularity
             * @param {Object} query the query to add the group by clause to
             */
            $scope.addGroupByGranularityClause = function(query) {
                var yearGroupClause = new neon.query.GroupByFunctionClause(neon.query.YEAR, $scope.options.dateField, 'year');
                var monthGroupClause = new neon.query.GroupByFunctionClause(neon.query.MONTH, $scope.options.dateField, 'month');
                var dayGroupClause = new neon.query.GroupByFunctionClause(neon.query.DAY, $scope.options.dateField, 'day');
                var hourGroupClause = new neon.query.GroupByFunctionClause(neon.query.HOUR, $scope.options.dateField, 'hour');

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

            /**
             * Initializes the name of the date field used to query the current dataset
             * and the Neon Messenger used to monitor data change events.
             * @method initialize
             */
            $scope.initialize = function() {
                // The brush handler needs to behave differently when the brush changes as part of a
                // granularity change.
                var updatingGranularity = false;

                // Switch bucketizers when the granularity is changed.
                $scope.$watch('options.granularity', function(newVal, oldVal) {
                    if(!$scope.loadingData && newVal && newVal !== oldVal) {
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "click",
                            elementId: "timeline-" + newVal,
                            elementType: "button",
                            elementSub: "timeline-" + newVal,
                            elementGroup: "chart_group",
                            source: "user",
                            tags: ["timeline", "granularity", newVal]
                        });
                        $scope.startDateForDisplay = undefined;
                        $scope.endDateForDisplay = undefined;
                        $scope.setGranularity(newVal);
                        $scope.updateDates();

                        if(0 < $scope.brush.length) {
                            updatingGranularity = true;
                            var newBrushStart = $scope.bucketizer.roundDownBucket($scope.brush[0]);
                            var newBrushEnd = $scope.bucketizer.roundUpBucket($scope.brush[1]);

                            if(newBrushStart.getTime() !== $scope.brush[0].getTime() || newBrushEnd.getTime() !== $scope.brush[1].getTime()) {
                                $scope.brush = [newBrushStart, newBrushEnd];
                            }
                            $scope.queryForChartData();
                        } else {
                            $scope.queryForChartData();
                        }
                    }
                });

                // Watch for brush changes and set the appropriate neon filter.
                $scope.$watch('brush', function(newVal) {
                    if(newVal.length && $scope.messenger && connectionService.getActiveConnection()) {
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

                        // if a single spot was clicked, just reset the timeline - An alternative would be to expand to the minimum width
                        if(undefined === newVal || 2 > newVal.length || newVal[0].getTime() === newVal[1].getTime()) {
                            // may be undefined when a new dataset is being loaded
                            if($scope.bucketizer.getStartDate() !== undefined && $scope.bucketizer.getEndDate() !== undefined) {
                                // Store the extents for the filter to use during filter creation.
                                $scope.startExtent = $scope.bucketizer.getStartDate();
                                $scope.endExtent = $scope.bucketizer.getEndDate();
                                $scope.brush = [];
                                $scope.extentDirty = true;
                            } else {
                                return;
                            }
                        } else {
                            $scope.startExtent = newVal[0];
                            $scope.endExtent = newVal[1];
                        }

                        var relations = datasetService.getRelations($scope.options.database.name, $scope.options.table.name, [$scope.options.dateField]);

                        if(updatingGranularity) {
                            // If the brush changed because of a granularity change, then don't
                            // update the chart. The granularity change will cause the data to be
                            // updated
                            filterService.replaceFilters($scope.messenger, relations, $scope.filterKeys, $scope.createFilterClauseForDate);
                            updatingGranularity = false;
                        } else {
                            // Because the timeline ignores its own filter, we just need to update the
                            // chart times and total when this filter is applied
                            filterService.replaceFilters($scope.messenger, relations, $scope.filterKeys, $scope.createFilterClauseForDate, $scope.updateChartTimesAndTotal);
                        }
                    }
                }, true);

                $scope.messenger = new neon.eventing.Messenger();

                $scope.messenger.events({
                    filtersChanged: onFiltersChanged
                });

                $scope.$on('$destroy', function() {
                    XDATA.userALE.log({
                        activity: "remove",
                        action: "click",
                        elementId: "timeline",
                        elementType: "canvas",
                        elementSub: "timeline",
                        elementGroup: "chart_group",
                        source: "user",
                        tags: ["remove", "timeline"]
                    });
                    $scope.messenger.removeEvents();
                    // Remove our filter if we had an active one.
                    if(0 < $scope.brush.length) {
                        filterService.removeFilters($scope.messenger, $scope.filterKeys);
                    }
                });
            };

            /**
             * Creates and returns a filter on the given table and date field using the extent set by this visualization.
             * @param {String} The name of the table on which to filter
             * @param {String} The name of the date field on which to filter
             * @method createFilterClauseForDate
             * @return {Object} A neon.query.Filter object
             */
            $scope.createFilterClauseForDate = function(tableName, dateFieldName) {
                var startFilterClause = neon.query.where(dateFieldName, '>=', $scope.bucketizer.zeroOutDate($scope.startExtent));
                var endFilterClause = neon.query.where(dateFieldName, '<', $scope.bucketizer.roundUpBucket($scope.endExtent));
                var clauses = [startFilterClause, endFilterClause];
                return neon.query.and.apply(this, clauses);
            };

            /**
             * Event handler for filter changed events issued over Neon's messaging channels.
             * @param {Object} message A Neon filter changed message.
             * @method onFiltersChanged
             * @private
             */
            var onFiltersChanged = function(message) {
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
                if(message.addedFilter && message.addedFilter.databaseName === $scope.options.database.name && message.addedFilter.tableName === $scope.options.table.name) {
                    $scope.queryForChartData();
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
                $scope.filterKeys = filterService.createFilterKeys("timeline", datasetService.getDatabaseAndTableNames());

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
                $scope.options.table = datasetService.getFirstTableWithMappings($scope.options.database.name, ["date"]) || $scope.tables[0];
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
                $scope.fields = datasetService.getDatabaseFields($scope.options.database.name, $scope.options.table.name);
                $scope.fields.sort();
                $scope.options.dateField = $scope.bindDateField || datasetService.getMapping($scope.options.database.name, $scope.options.table.name, "date") || "date";
                $scope.resetAndQueryForChartData();
            };

            $scope.resetAndQueryForChartData = function() {
                $scope.bucketizer.setStartDate(undefined);
                $scope.startDateForDisplay = undefined;
                $scope.endDateForDisplay = undefined;
                $scope.referenceStartDate = undefined;
                $scope.referenceEndDate = undefined;
                $scope.data = [];
                if($scope.brush.length) {
                    $scope.clearBrush();
                }
                $scope.queryForChartData();
            };

            /**
             * Triggers a Neon query that will aggregate the time data for the currently selected dataset.
             * @method queryForChartData
             */
            $scope.queryForChartData = function() {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                var connection = connectionService.getActiveConnection();

                if(!connection) {
                    $scope.updateChartData({
                        data: []
                    });
                    $scope.loadingData = false;
                    return;
                }

                var query = new neon.query.Query()
                    .selectFrom($scope.options.database.name, $scope.options.table.name)
                    .where($scope.options.dateField, '!=', null);

                $scope.addGroupByGranularityClause(query);

                query.aggregate(neon.query.COUNT, '*', 'count');
                // TODO: Does this need to be an aggregate on the date field? What is MIN doing or is this just an arbitrary function to include the date with the query?
                query.aggregate(neon.query.MIN, $scope.options.dateField, 'date');
                query.sortBy('date', neon.query.ASCENDING);
                query.ignoreFilters([$scope.filterKeys[$scope.options.database.name][$scope.options.table.name]]);

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

                connection.executeQuery(query, function(queryResults) {
                    $scope.$apply(function() {
                        $scope.updateChartData(queryResults);
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
                }, function(response) {
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
                    $scope.loadingData = false;
                    if(response.responseJSON) {
                        $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
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
                var total = 0;
                // endIdx points to the start of the day/hour just after the buckets we want to count, so do not
                // include the bucket at endIdx.
                for(i = startIdx; i < endIdx; i++) {
                    total += $scope.options.primarySeries.data[i].value;
                }

                var displayStartDate = new Date(extentStartDate);
                var displayEndDate = new Date(extentEndDate);
                $scope.setDisplayDates(displayStartDate, displayEndDate);

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
                    $scope.updateChartTimesAndTotal();
                }
            };

            $scope.getMinMaxDates = function(success) {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                // TODO: neon doesn't yet support a more efficient way to just get the min/max fields without aggregating
                // TODO: This could be done better with a promise framework - just did this in a pinch for a demo
                var minDateQuery = new neon.query.Query()
                    .selectFrom($scope.options.database.name, $scope.options.table.name).ignoreFilters()
                    .where($scope.options.dateField, '!=', null).sortBy($scope.options.dateField, neon.query.ASCENDING).limit(1);

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
                var connection = connectionService.getActiveConnection();
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
                            $scope.referenceStartDate = new Date(queryResults.data[0][$scope.options.dateField]);
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

                var maxDateQuery = new neon.query.Query()
                    .selectFrom($scope.options.database.name, $scope.options.table.name).ignoreFilters()
                    .where($scope.options.dateField, '!=', null).sortBy($scope.options.dateField, neon.query.DESCENDING).limit(1);

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
                            $scope.referenceEndDate = new Date(queryResults.data[0][$scope.options.dateField]);
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

                // If we have no values, use our dates if they existed or now.
                if(rawData.length === 0) {
                    rawData[0] = {
                        date: $scope.bucketizer.getStartDate() || new Date(),
                        count: 0
                    };
                    rawLength = 1;
                }

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
                    queryData[bucketIndex].value = rawData[i].count;
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

                $scope.addStl2TimeSeriesAnalysis(timelineData, graphData);
                $scope.addAnomalyDetectionAnalysis(timelineData, graphData);
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
                    console.log("Got error from Anomaly Detection");
                    // If the request fails, then just update.
                    $scope.$apply();
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
                $scope.brush = [];
                filterService.removeFilters($scope.messenger, $scope.filterKeys);
            };

            $scope.updateDateField = function() {
                // TODO Logging
                if(!$scope.loadingData) {
                    $scope.resetAndQueryForChartData();
                }
            };

            // Wait for neon to be ready, the create our messenger and intialize the view and data.
            neon.ready(function() {
                $scope.initialize();
                $scope.displayActiveDataset(true);
            });
        }
    };
}]);
