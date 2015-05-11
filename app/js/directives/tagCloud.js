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
.directive('tagCloud', ['ConnectionService', 'DatasetService', 'FilterService', '$timeout',
function(connectionService, datasetService, filterService, $timeout) {
    return {
        templateUrl: 'partials/directives/tagCloud.html',
        restrict: 'EA',
        scope: {
            bindTagField: '='
        },
        link: function($scope, $element) {
            $element.addClass("tagcloud-container");

            $scope.element = $element;
            $scope.showOptionsMenuButtonText = function() {
                return $scope.filterTags.length === 0 && $scope.data.length === 0;
            };

            $scope.databaseName = '';
            $scope.tables = [];
            $scope.fields = [];
            $scope.data = [];
            $scope.filterTags = [];
            $scope.showFilter = false;
            $scope.filterKeys = {};

            $scope.options = {
                selectedTable: {
                    name: ""
                },
                tagField: "",
                andTags: true
            };

            /**
             * Initializes the name of the directive's scope variables
             * and the Neon Messenger used to monitor data change events.
             * @method initialize
             */
            $scope.initialize = function() {
                // Toggle the points and clusters view when the user toggles between them.
                $scope.$watch('options.andTags', function(newVal, oldVal) {
                    XDATA.userALE.log({
                        activity: "select",
                        action: "click",
                        elementId: (newVal) ? "all-filters-button" : "any-filters-button",
                        elementType: "radiobutton",
                        elementGroup: "chart_group",
                        source: "user",
                        tags: ["options", "tag-cloud"]
                    });
                    if(newVal !== oldVal) {
                        $scope.setTagFilter();
                    }
                });

                // Setup our messenger.
                $scope.messenger = new neon.eventing.Messenger();

                $scope.messenger.events({
                    filtersChanged: onFiltersChanged
                });
                $scope.messenger.subscribe("dataset_changed", onDatasetChanged);

                $scope.$on('$destroy', function() {
                    XDATA.userALE.log({
                        activity: "remove",
                        action: "click",
                        elementId: "tag-cloud",
                        elementType: "canvas",
                        elementSub: "tag-cloud",
                        elementGroup: "chart_group",
                        source: "user",
                        tags: ["remove", "tag-cloud"]
                    });
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
                XDATA.userALE.log({
                    activity: "alter",
                    action: "query",
                    elementId: "tag-cloud",
                    elementType: "tag",
                    elementSub: "tag-cloud",
                    elementGroup: "chart_group",
                    source: "system",
                    tags: ["filter-change", "tag-cloud"]
                });
                if(message.addedFilter && message.addedFilter.databaseName === $scope.databaseName && message.addedFilter.tableName === $scope.options.selectedTable.name) {
                    $scope.queryForTags();
                }
            };

            /**
             * Event handler for dataset changed events issued over Neon's messaging channels.
             * @method onDatasetChanged
             * @private
             */
            var onDatasetChanged = function() {
                XDATA.userALE.log({
                    activity: "alter",
                    action: "query",
                    elementId: "tag-cloud",
                    elementType: "tag",
                    elementSub: "tag-cloud",
                    elementGroup: "chart_group",
                    source: "system",
                    tags: ["dataset-change", "tag-cloud"]
                });
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
                $scope.options.selectedTable = datasetService.getFirstTableWithMappings(["tags"]) || $scope.tables[0];
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
                $scope.fields = datasetService.getDatabaseFields($scope.options.selectedTable.name);
                $scope.fields.sort();
                $scope.options.tagField = $scope.bindTagField || datasetService.getMapping($scope.options.selectedTable.name, "tags") || $scope.fields[0] || "";
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
                if($scope.options.tagField !== '') {
                    var connection = connectionService.getActiveConnection();
                    if(connection) {
                        var host = connection.host_;
                        var url = neon.serviceUrl('mongotagcloud', 'tagcounts', 'host=' + host + "&db=" + $scope.databaseName + "&collection=" + $scope.options.selectedTable.name + "&arrayfield=" + $scope.options.tagField + "&limit=40");

                        XDATA.userALE.log({
                            activity: "alter",
                            action: "query",
                            elementId: "tag-cloud",
                            elementType: "tag",
                            elementSub: "tag-cloud",
                            elementGroup: "chart_group",
                            source: "system",
                            tags: ["query", "tag-cloud"]
                        });
                        neon.util.ajaxUtils.doGet(url, {
                            success: function(tagCounts) {
                                XDATA.userALE.log({
                                    activity: "alter",
                                    action: "query",
                                    elementId: "tag-cloud",
                                    elementType: "tag",
                                    elementSub: "tag-cloud",
                                    elementGroup: "chart_group",
                                    source: "system",
                                    tags: ["receive", "tag-cloud"]
                                });
                                $scope.$apply(function() {
                                    $scope.updateTagData(tagCounts);
                                    XDATA.userALE.log({
                                        activity: "alter",
                                        action: "query",
                                        elementId: "tag-cloud",
                                        elementType: "tag",
                                        elementSub: "tag-cloud",
                                        elementGroup: "chart_group",
                                        source: "system",
                                        tags: ["render", "tag-cloud"]
                                    });
                                });
                            },
                            error: function() {
                                XDATA.userALE.log({
                                    activity: "alter",
                                    action: "query",
                                    elementId: "tag-cloud",
                                    elementType: "tag",
                                    elementSub: "tag-cloud",
                                    elementGroup: "chart_group",
                                    source: "system",
                                    tags: ["failed", "tag-cloud"]
                                });
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
                if($scope.options.andTags) {
                    $scope.data = tagCounts.filter(function(elem) {
                        return $scope.filterTags.indexOf(elem.tag) === -1;
                    });
                } else {
                    $scope.data = tagCounts;
                }

                // style the tags after they are displayed
                $timeout(function() {
                    $element.find('.tag').tagcloud();
                });
            };

            /**
             * Ensures that the tag filter includes the argument, and updates the tag cloud if necessary.
             * @param tagName {String} the tag that should be filtered on, e.g., "#lol"
             * @method addTagFilter
             */
            $scope.addTagFilter = function(tagName) {
                XDATA.userALE.log({
                    activity: "add",
                    action: "click",
                    elementId: "tag-cloud",
                    elementType: "tag",
                    elementGroup: "chart_group",
                    source: "user",
                    tags: ["filter", "tag-cloud", tagName]
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
             * Creates a filter select object that has a where clause that "or"s all of the tags together
             * @param {String} The name of the table on which to filter
             * @param {Array} An array containing the name of the tag field as its first element
             * @method createFilterForTags
             * @returns {Object} A neon.query.Filter object
             */
            $scope.createFilterForTags = function(tableName, fieldNames) {
                var tagFieldName = fieldNames[0];
                var filterClause;
                var filterClauses = $scope.filterTags.map(function(tagName) {
                    return neon.query.where(tagFieldName, "=", tagName);
                });
                if($scope.options.andTags) {
                    filterClause = filterClauses.length > 1 ? neon.query.and.apply(neon.query, filterClauses) : filterClauses[0];
                } else {
                    filterClause = filterClauses.length > 1 ? neon.query.or.apply(neon.query, filterClauses) : filterClauses[0];
                }
                return new neon.query.Filter().selectFrom($scope.databaseName, tableName).where(filterClause);
            };

            /**
             * Applies the specified filter and updates the visualization on success
             * @method applyFilter
             */
            $scope.applyFilter = function() {
                var relations = datasetService.getRelations($scope.options.selectedTable.name, [$scope.options.tagField]);
                filterService.replaceFilters($scope.messenger, relations, $scope.filterKeys, $scope.createFilterForTags, function() {
                    $scope.$apply(function() {
                        $scope.queryForTags();
                        // Show the Clear Filter button.
                        $scope.showFilter = true;
                        $scope.error = "";
                    });
                }, function() {
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
                XDATA.userALE.log({
                    activity: "remove",
                    action: "click",
                    elementId: "tag-cloud",
                    elementType: "tag",
                    elementGroup: "chart_group",
                    source: "user",
                    tags: ["filter", "tag-cloud", tagName]
                });
                $scope.filterTags = _.without($scope.filterTags, tagName);
            };

            // Wait for neon to be ready, the create our messenger and intialize the view and data.
            neon.ready(function() {
                $scope.initialize();
                $scope.displayActiveDataset(true);
            });
        }
    };
}]);
