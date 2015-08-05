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
.directive('tagCloud', ['ConnectionService', 'DatasetService', 'ErrorNotificationService', 'FilterService', 'ExportService', '$timeout',
function(connectionService, datasetService, errorNotificationService, filterService, exportService, $timeout) {
    return {
        templateUrl: 'partials/directives/tagCloud.html',
        restrict: 'EA',
        scope: {
            bindTagField: '=',
            bindTable: '=',
            bindDatabase: '=',
            hideHeader: '=?',
            hideAdvancedOptions: '=?'
        },
        link: function($scope, $element) {
            $element.addClass("tagcloud-container");

            $scope.element = $element;

            $scope.showOptionsMenuButtonText = function() {
                return $scope.filterTags.length === 0 && $scope.data.length === 0;
            };

            $scope.databases = [];
            $scope.tables = [];
            $scope.fields = [];
            $scope.data = [];
            $scope.filterTags = [];
            $scope.showFilter = false;
            $scope.filterKeys = {};
            $scope.errorMessage = undefined;
            $scope.loadingData = false;

            $scope.options = {
                database: {},
                table: {},
                tagField: "",
                andTags: true,
                tagLimit: 40
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
                        action: ($scope.loadingData) ? "reset" : "click",
                        elementId: "tag-cloud-options",
                        elementType: "button",
                        elementSub: (newVal) ? "all-filters" : "any-filters",
                        elementGroup: "chart_group",
                        source: ($scope.loadingData) ? "system" : "user",
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

                $scope.messenger.subscribe(filterService.REQUEST_REMOVE_FILTER, function(ids) {
                    if(filterService.containsKey($scope.filterKeys, ids)) {
                        $scope.clearTagFilters();
                    }
                });

                $scope.exportID = exportService.register($scope.makeTagCloudExportObject);

                $scope.$on('$destroy', function() {
                    XDATA.userALE.log({
                        activity: "remove",
                        action: "remove",
                        elementId: "tag-cloud",
                        elementType: "canvas",
                        elementSub: "tag-cloud",
                        elementGroup: "chart_group",
                        source: "system",
                        tags: ["remove", "tag-cloud"]
                    });
                    $scope.messenger.removeEvents();
                    // Remove our filter if we had an active one.
                    if(0 < $scope.filterTags.length) {
                        filterService.removeFilters($scope.messenger, $scope.filterKeys);
                    }
                    exportService.unregister($scope.exportID);
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
                if(message.addedFilter && message.addedFilter.databaseName === $scope.options.database.name && message.addedFilter.tableName === $scope.options.table.name) {
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
                    $scope.queryForTags();
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
                $scope.filterKeys = filterService.createFilterKeys("tagcloud", datasetService.getDatabaseAndTableNames());

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
                $scope.options.table = datasetService.getFirstTableWithMappings($scope.options.database.name, ["tags"]) || $scope.tables[0];
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
                $scope.options.tagField = $scope.bindTagField || datasetService.getMapping($scope.options.database.name, $scope.options.table.name, "tags") || $scope.fields[0] || "";
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
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                var connection = connectionService.getActiveConnection();

                if(!connection || !$scope.options.tagField) {
                    $scope.updateTagData([]);
                    $scope.loadingData = false;
                    return;
                }

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

                connection.executeArrayCountQuery($scope.options.database.name, $scope.options.table.name, $scope.options.tagField, $scope.options.tagLimit, function(tagCounts) {
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
                        $scope.loadingData = false;
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
                }, function(response) {
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
                    $scope.updateTagData([]);
                    $scope.loadingData = false;
                    if(response.responseJSON) {
                        $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                    }
                });
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
             * Creates and returns a filter on the given tag field using the tags set by this visualization.
             * @param {Object} databaseAndTableName Contains the database and table name
             * @param {String} tagFieldName The name of the tag field on which to filter
             * @method createFilterClauseForTags
             * @return {Object} A neon.query.Filter object
             */
            $scope.createFilterClauseForTags = function(databaseAndTableName, tagFieldName) {
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
                var relations = datasetService.getRelations($scope.options.database.name, $scope.options.table.name, [$scope.options.tagField]);
                filterService.replaceFilters($scope.messenger, relations, $scope.filterKeys, $scope.createFilterClauseForTags, {
                    visName: "Tag Cloud",
                    text: $scope.filterTags.join(', ')
                },function() {
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

            $scope.updateTagField = function() {
                // TODO Logging
                if(!$scope.loadingData) {
                    $scope.queryForTags();
                }
            };

            /**
             * Creates and returns an object that contains information needed to export the data in this widget.
             * @return {Object} An object containing all the information needed to export the data in this widget.
             */
            $scope.makeTagCloudExportObject = function() {
                XDATA.userALE.log({
                    activity: "perform",
                    action: "click",
                    elementId: "tag-cloud-export",
                    elementType: "button",
                    elementGroup: "chart_group",
                    source: "user",
                    tags: ["options", "tag-cloud", "export"]
                });
                var finalObject = {
                    name: "Tag_Cloud",
                    data: [{
                        database: $scope.options.database.name,
                        table: $scope.options.table.name,
                        field: $scope.options.tagField,
                        limit: $scope.options.tagLimit,
                        name: "tagCloud-" + $scope.exportID,
                        fields: [],
                        type: "arraycount"
                    }]
                };
                finalObject.data[0].fields.push({
                    query: "key",
                    pretty: "Key"
                });
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
