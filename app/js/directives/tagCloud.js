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
'use strict';

/**
 * This directive is for building a tag cloud
 */
angular.module('neonDemo.directives')
.directive('tagCloud', ['ConnectionService', 'DatasetService', 'FilterService', '$timeout', function(connectionService, datasetService, filterService, $timeout) {
    return {
        templateUrl: 'partials/directives/tagCloud.html',
        restrict: 'EA',
        scope: {
            bindTagField: '='
        },
        link: function($scope, element) {
            element.addClass("tagcloud-container");
            $scope.databaseName = '';
            $scope.tables = [];
            $scope.selectedTable = {
                name: ""
            };
            $scope.fields = [];

            $scope.uniqueChartOptions = 'chart-options-' + uuid();
            var chartOptions = $(element).find('.chart-options');
            chartOptions.toggleClass($scope.uniqueChartOptions);

            // data will be a list of tag name/counts in descending order
            $scope.data = [];

            // optionsDisplayed is used merely to track the display of the options menu
            // for usability and workflow analysis.
            $scope.optionsDisplayed = false;

            $scope.filterTags = [];
            $scope.showFilter = false;
            $scope.andTags = true;
            $scope.filterKeys = {};

            /**
             * Initializes the name of the directive's scope variables
             * and the Neon Messenger used to monitor data change events.
             * @method initialize
             */
            $scope.initialize = function() {
                // Toggle the points and clusters view when the user toggles between them.
                $scope.$watch('andTags', function(newVal, oldVal) {
                    XDATA.activityLogger.logUserActivity('TagCloud - user toggled tag combination', 'select_filter_menu_option',
                        XDATA.activityLogger.WF_EXPLORE,
                        {
                            and: newVal,
                            or: !newVal
                        });
                    if(newVal !== oldVal) {
                        $scope.setTagFilter();
                    }
                });

                // Log whenever the user toggles the options display.
                $scope.$watch('optionsDisplayed', function(newVal) {
                    var action = (newVal === true) ? 'show_options' : 'hide_options';
                    XDATA.activityLogger.logUserActivity('TagCloud - user toggled options display', action,
                        XDATA.activityLogger.WF_EXPLORE);
                });

                // Setup our messenger.
                $scope.messenger = new neon.eventing.Messenger();

                $scope.messenger.events({
                    filtersChanged: onFiltersChanged
                });
                $scope.messenger.subscribe("dataset_changed", onDatasetChanged);

                $scope.$on('$destroy', function() {
                    $scope.messenger.removeEvents();
                    // Remove our filter if we had an active one.
                    if(0 < $scope.filterTags.length) {
                        filterService.removeFilters($scope.messenger, $scope.filterKeys);
                    }
                });

                // setup tag cloud color/size changes
                $.fn.tagcloud.defaults = {
                    size: {
                        start: 130,
                        end: 250,
                        unit: '%'
                    },
                    color: {
                        start: '#aaaaaa',
                        end: '#2f9f3e'
                    }
                };

                $scope.$watchCollection('filterTags', function(newValue, oldValue) {
                    if(newValue.length !== oldValue.length || newValue.length > 1) {
                        $scope.setTagFilter();
                    }
                });
            };

            /**
             * Event handler for filter changed events issued over Neon's messaging channels.
             * @param {Object} message A Neon filter changed message.
             * @method onFiltersChanged
             * @private
             */
            var onFiltersChanged = function(message) {
                XDATA.activityLogger.logSystemActivity('TagCloud - received neon filter changed event');
                if(message.addedFilter && message.addedFilter.databaseName === $scope.databaseName && message.addedFilter.tableName === $scope.selectedTable.name) {
                    $scope.queryForTags();
                }
            };

            /**
             * Event handler for dataset changed events issued over Neon's messaging channels.
             * @method onDatasetChanged
             * @private
             */
            var onDatasetChanged = function() {
                XDATA.activityLogger.logSystemActivity('TagCloud - received neon-gtd dataset changed event');
                $scope.displayActiveDataset(false);
            };

            /**
             * Displays data for any currently active datasets.
             * @param {Boolean} Whether this function was called during visualization initialization.
             * @method displayActiveDataset
             */
            $scope.displayActiveDataset = function(initializing) {
                if(!datasetService.hasDataset()) {
                    return;
                }

                $scope.databaseName = datasetService.getDatabase();
                $scope.tables = datasetService.getTables();
                $scope.selectedTable = datasetService.getFirstTableWithMappings(["tags"]) || $scope.tables[0];
                $scope.filterKeys = filterService.createFilterKeys("tagcloud", $scope.tables);

                if(initializing) {
                    $scope.updateFieldsAndQueryForTags();
                } else {
                    $scope.$apply(function() {
                        $scope.updateFieldsAndQueryForTags();
                    });
                }
            };

            $scope.updateFieldsAndQueryForTags = function() {
                $scope.fields = datasetService.getDatabaseFields($scope.selectedTable.name);
                $scope.fields.sort();
                $scope.tagField = $scope.bindTagField || datasetService.getMapping($scope.selectedTable.name, "tags") || "";
                if($scope.showFilter) {
                    $scope.clearTagFilters();
                } else {
                    $scope.queryForTags();
                }
            };

            /**
             * Triggers a query that will aggregate the most popular tags in the tag cloud
             * @method queryForTags
             */
            $scope.queryForTags = function() {
                if($scope.tagField !== '') {
                    var connection = connectionService.getActiveConnection();
                    if(connection) {
                        var host = connection.host_;
                        var url = neon.serviceUrl('mongotagcloud', 'tagcounts', 'host=' + host + "&db=" + $scope.databaseName + "&collection=" + $scope.selectedTable.name + "&arrayfield=" + $scope.tagField + "&limit=40");

                        XDATA.activityLogger.logSystemActivity('TagCloud - query for tag data');
                        neon.util.ajaxUtils.doGet(url, {
                            success: function(tagCounts) {
                                XDATA.activityLogger.logSystemActivity('TagCloud - received tag data');
                                $scope.$apply(function() {
                                    $scope.updateTagData(tagCounts);
                                    XDATA.activityLogger.logSystemActivity('TagCloud - rendered tag data');
                                });
                            },
                            error: function() {
                                XDATA.activityLogger.logSystemActivity('TagCloud - failed to receive tag data');
                            }
                        });
                    }
                }
            };

            /**
             * Updates the the tag cloud visualization.
             * @param {Array} tagCounts An array of objects with "tag" and "count" properties for the tag
             * name and number of occurrences.
             * @method updateTagData
             */
            $scope.updateTagData = function(tagCounts) {
                if($scope.andTags) {
                    $scope.data = tagCounts.filter(function(elem) {
                        return $scope.filterTags.indexOf(elem.tag) === -1;
                    });
                } else {
                    $scope.data = tagCounts;
                }

                // style the tags after they are displayed
                $timeout(function() {
                    element.find('.tag').tagcloud();
                });
            };

            /**
             * Ensures that the tag filter includes the argument, and updates the tag cloud if necessary.
             * @param tagName {String} the tag that should be filtered on, e.g., "#lol"
             * @method addTagFilter
             */
            $scope.addTagFilter = function(tagName) {
                XDATA.activityLogger.logUserActivity('TagCloud - user added a tag as a filter', 'execute_visual_filter',
                    XDATA.activityLogger.WF_EXPLORE,
                    {
                        tag: tagName
                    });
                if($scope.filterTags.indexOf(tagName) === -1) {
                    $scope.filterTags.push(tagName);
                }
            };

            /**
             * Changes the filter to use the ones provided in the first argument.
             * @method setTagFilter
             */
            $scope.setTagFilter = function() {
                if($scope.filterTags.length > 0) {
                    $scope.applyFilter();
                } else {
                    $scope.clearTagFilters();
                }
            };

            /**
             * Creates and returns a filter on the given table and tag field using the tags set by this visualization.
             * @param {String} The name of the table on which to filter
             * @param {String} The name of the tag field on which to filter
             * @method createFilterClauseForTags
             * @returns {Object} A neon.query.Filter object
             */
            $scope.createFilterClauseForTags = function(tableName, tagFieldName) {
                var filterClauses = $scope.filterTags.map(function(tagName) {
                    return neon.query.where(tagFieldName, "=", tagName);
                });
                if(filterClauses.length === 1) {
                    return filterClauses[0];
                }
                if($scope.andTags) {
                    return neon.query.and.apply(neon.query, filterClauses);
                }
                return neon.query.or.apply(neon.query, filterClauses);
            };

            /**
             * Applies the specified filter and updates the visualization on success
             * @method applyFilter
             */
            $scope.applyFilter = function() {
                XDATA.activityLogger.logSystemActivity('TagCloud - applying neon filter based on updated tag selections');

                var relations = datasetService.getRelations($scope.selectedTable.name, [$scope.tagField]);
                filterService.replaceFilters($scope.messenger, relations, $scope.filterKeys, $scope.createFilterClauseForTags, function() {
                    XDATA.activityLogger.logSystemActivity('TagCloud - applied neon filter');
                    $scope.$apply(function() {
                        $scope.queryForTags();
                        // Show the Clear Filter button.
                        $scope.showFilter = true;
                        $scope.error = "";
                        XDATA.activityLogger.logSystemActivity('TagCloud - rendered updated cloud');
                    });
                }, function() {
                    XDATA.activityLogger.logSystemActivity('TagCloud - failed to apply neon filter');
                    // Notify the user of the error.
                    $scope.error = "Error: Failed to apply the filter.";
                });
            };

            /**
             * Removes the filter and updates.
             * @method clearTagFilters
             */
            $scope.clearTagFilters = function() {
                filterService.removeFilters($scope.messenger, $scope.filterKeys, function() {
                    $scope.$apply(function() {
                        $scope.showFilter = false;
                        $scope.filterTags = [];
                        $scope.error = "";
                        $scope.queryForTags();
                    });
                }, function() {
                    // Notify the user of the error.
                    $scope.error = "Error: Failed to clear filter.";
                });
            };

            /**
             * Remove a particular tag from the filter and update.
             * @param tagName {String} the tag to remove from the filter, e.g., "#lol"
             * @method removeFilter
             */
            $scope.removeFilter = function(tagName) {
                XDATA.activityLogger.logUserActivity('TagCloud - user removed a tag as a filter', 'remove_visual_filter',
                    XDATA.activityLogger.WF_EXPLORE,
                    {
                        tag: tagName
                    });
                $scope.filterTags = _.without($scope.filterTags, tagName);
            };

            $scope.toggleOptionsDisplay = function() {
                $scope.optionsDisplayed = !$scope.optionsDisplayed;
            };

            // Wait for neon to be ready, the create our messenger and intialize the view and data.
            neon.ready(function() {
                $scope.initialize();
                $scope.displayActiveDataset(true);
            });
        }
    };
}]);
