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

angular.module('neonDemo.directives')
.directive('sample', ['ConnectionService', 'DatasetService', 'ErrorNotificationService', 'FilterService', 'ExportService',
function(connectionService, datasetService, errorNotificationService, filterService, exportService) {
    return {
        templateUrl: 'partials/directives/sample.html',
        restrict: 'EA',
        // Bindings can be set in the config.json file using the following format (please note the two sets of quotation marks):
        //   "bind-database": "'myDatabase'"
        scope: {
            bindDatabase: '=',
            bindTable: '=',
            bindField: '='
        },
        link: function($scope, $element) {
            // Class used for styling (see sample.less).
            $element.addClass('sampleDirective');

            // Add the directive element to the scope for use by the options menu.
            $scope.element = $element;

            // Use the following two functions to display text next to the options menu in the upper right corner of the visualization (the gear icon).
            $scope.optionsMenuButtonText = function() {
                return ($scope.data.length || "No") + ($scope.data.length === 1 ? " result " : " results");
            };
            $scope.showOptionsMenuButtonText = function() {
                return true;
            };

            // Save the lists of databases, tables, and fields in the active dataset so the user can choose which to use in the options menu.  Each database, table, and field is an object.
            $scope.databases = [];
            $scope.tables = [];
            $scope.fields = [];

            // Filter keys are unique IDs used to set filters through the Neon Messenger.
            $scope.filterKeys = {};

            // The current filter for this visualization.  Some visualizations may not use a filter and others may use multiple (this example only uses one).
            $scope.filter = undefined;

            // The error message from the Neon server currently displayed in this visualization through the Error Notification Service.
            $scope.errorMessage = undefined;

            // Whether this visualization is currently loading data due to a query.
            $scope.loadingData = false;

            // Often the visualization will want to save the data from its most recent query for ongoing interaction through its display.
            $scope.data = [];

            // Options available through the options menu for this visualization (the gear icon).  Must be in an object due to angular transclude scoping.
            $scope.options = {
                database: {},
                table: {},
                field: {}
            };

            /**
             * Initializes the visualization.
             * @method initialize
             */
            var initialize = function() {
                // Create a Neon Messenger for subscribing to and publishing events through the Neon API.
                $scope.messenger = new neon.eventing.Messenger();

                // Mock callback for the example below.
                var customChannelCallback = function(message) {};

                // Subscribe to custom channels.
                $scope.messenger.subscribe("custom_channel", customChannelCallback);

                // Subscribe to the "update data" channel:  If the active dataset is configured to requery periodically, it publishes an "update data" event to force the visualizations to requery.
                $scope.messenger.subscribe(datasetService.UPDATE_DATA_CHANNEL, function() {
                    queryForData();
                });

                // Shortcut function to subscribe to Neon API channels.
                // Subscribe to the "filters changed" channel:  If a visualization adds or removes a filter, it publishes a "filters changed" event to all other visualizations.
                $scope.messenger.events({
                    filtersChanged: onFiltersChanged
                });

                // Register this visualization with the Export Service so its data can be exported to file.
                $scope.exportID = exportService.register($scope.makeExportObject);

                $scope.$on('$destroy', function() {
                    $scope.messenger.removeEvents();
                    // Remove any filters that have been set.
                    if($scope.filter) {
                        filterService.removeFilters($scope.messenger, $scope.filterKeys);
                    }
                    exportService.unregister($scope.exportID);
                });
            };

            /**
             * Event handler for filter changed events issued over Neon's messaging channels.
             * @param {Object} message A Neon filter changed message.
             * @method onFiltersChanged
             * @private
             */
            var onFiltersChanged = function(message) {
                // Check if the event affects the database/table that this visualization is using; if so, requery for the filtered data.
                // Please note that all "filters changed" events (add, replace, or remove) will contain an addedFilter object with databaseName and tableName properties.
                if(message.addedFilter && message.addedFilter.databaseName === $scope.options.database.name && message.addedFilter.tableName === $scope.options.table.name) {
                    queryForData();
                }
            };

            /**
             * Displays data for any currently active datasets.
             * @param {Boolean} Whether this function was called during visualization initialization.
             * @method displayActiveDataset
             * @private
             */
            var displayActiveDataset = function(initializing) {
                if(!datasetService.hasDataset() || $scope.loadingData) {
                    return;
                }

                $scope.databases = datasetService.getDatabases();

                // Set the default database to use in this visualization.  Check if a binding was set in the config.json file.  Each database is an object.
                $scope.options.database = $scope.databases[0];
                if($scope.bindDatabase) {
                    for(var i = 0; i < $scope.databases.length; ++i) {
                        if($scope.bindDatabase === $scope.databases[i].name) {
                            $scope.options.database = $scope.databases[i];
                            break;
                        }
                    }
                }

                // Create a map of filter keys for each database/table pair available to this visualization.
                $scope.filterKeys = filterService.createFilterKeys("sample", datasetService.getDatabaseAndTableNames());

                // If initializing, this function was called inside neon.ready which is already in an angular apply.
                // If not, this function was called by a non-angular event, so wrap the update in an angular apply so the HTML is updated.
                if(initializing) {
                    $scope.updateTables();
                } else {
                    $scope.$apply(function() {
                        $scope.updateTables();
                    });
                }
            };

            /**
             * Updates the list of available tables and the default table to use in this visualization from the tables in the active dataset.
             * @method updateTables
             */
            $scope.updateTables = function() {
                $scope.tables = datasetService.getTables($scope.options.database.name);

                // Set the default table to use in this visualization.  Check if a binding was set in the config.json file.
                $scope.options.table = $scope.tables[0];
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

            /**
             * Updates the list of available fields and the default fields to use in this visualization from the fields in the active dataset.
             * @method updateFields
             */
            $scope.updateFields = function() {
                // Prevent extraneous queries from onFieldChanged.
                $scope.loadingData = true;

                $scope.fields = datasetService.getSortedFields($scope.options.database.name, $scope.options.table.name);

                // Set the default table to use in this visualization.  Check if a binding was set in the config.json file.
                var fieldName = $scope.bindField || "";
                // Field objects contain {String} columnName (the name matching the field in the database) and {String} prettyName (the name to display in the dashboard).
                $scope.options.field = _.find($scope.fields, function(field) {
                    return field.columnName === fieldName;
                }) || datasetService.createBlankField();

                if($scope.filter) {
                    $scope.removeFilter();
                }

                queryForData();
            };

            /**
             * Query for data to display in this visualization using the Neon Connection.
             * @method queryForData
             * @private
             */
            var queryForData = function() {
                // Error messages display common errors returned by the server.
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                // Get the dashboard's active connection to the Neon server.
                var connection = connectionService.getActiveConnection();

                // If no connection or field is available, reset the visualization.
                if(!connection || !datasetService.isFieldValid($scope.options.field)) {
                    updateData({
                        data: []
                    });
                    $scope.loadingData = false;
                    return;
                }

                // Build the query and execute it by sending it to the server using the connection.
                var query = buildQuery();

                connection.executeQuery(query, function(results) {
                    $scope.$apply(function() {
                        // Update the data for this visualization with the query results.
                        updateData(results);
                        $scope.loadingData = false;
                    });
                }, function(response) {
                    // If the query returned an error, reset the visualization.
                    updateData({
                        data: []
                    });
                    $scope.loadingData = false;
                    // If the error response contains an error message, use the Error Notification Service to display that message.
                    if(response.responseJSON) {
                        $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                    }
                });
            };

            /**
             * Builds the query for this visualization.
             * @method buildQuery
             * @return {neon.query.Query}
             * @private
             */
            var buildQuery = function() {
                var query = new neon.query.Query().selectFrom($scope.options.database.name, $scope.options.table.name);

                // TODO Replace the follwing code with your own query properties.
                query.groupBy($scope.options.field);
                query.aggregate(neon.query.COUNT, '*', 'count');
                query.sortBy('count', neon.query.DESCENDING);
                query.where($scope.options.field.columnName, "!=", null);

                // Some visualizations will ignore their own filters and display unfiltered values differently than filtered values (like changing their color or font).
                query.ignoreFilters([$scope.filterKeys[$scope.options.database.name][$scope.options.table.name]]);

                return query;
            };

            /**
             * Updates this visualization to display the data in the given results.
             * @param {Object} results The results returned from a Neon query containing an {Array} data of {Object} data rows mapping column name to value.
             * @method updateData
             * @private
             */
            var updateData = function(results) {
                // TODO Display the rows returned by the query (results.data) in the visualization.
                $scope.data = results.data;
            };

            /**
             * Sets the given field and value as the filter for this visualization.
             * @param {String} field The filter field
             * @param {String} value The filter value
             * @method setFilter
             */
            $scope.setFilter = function(field, value) {
                var filterExists = $scope.filter ? true : false;

                // Save the filter to display in the visualization and use in createFilterClause.
                $scope.filter = {
                    field: field,
                    value: value
                };

                // Get the dashboard's active connection to the Neon server.
                var connection = connectionService.getActiveConnection();

                if($scope.messenger && connection) {
                    // Get the relations for the filter's database/table/field.  This will include an element for the arguments.  Please see the User Guide for more information on relations.
                    // Please note that the size of the array of fields determines the second argument for the createFilterClause function:
                    //      If the array of fields contains a single field (like this case), the second argument for the createFilterClause function is a String.
                    //      Otherwise, the second argument for the createFilterClause function is an array whose elements are in the same order as the array of fields.
                    var relations = datasetService.getRelations($scope.options.database.name, $scope.options.table.name, [field]);

                    // Create an object containing the name of the filter to display in the filter tray (if enabled).
                    var filterName = {
                        visName: "Sample",
                        text: field + " = " + value
                    };

                    // For this example visualization we only want to set one filter at a time so call replaceFilters to replace the existing filter if one exists or addFilter to add a filter otherwise.
                    // The Filter Service will add/replace filters for all relations using one or more of the filter keys.  Once done, it will query for data.
                    // Filters are created using the createFilterClause function.
                    if(filterExists) {
                        filterService.replaceFilters($scope.messenger, relations, $scope.filterKeys, createFilterClause, filterName, queryForData, queryForData);
                    } else {
                        filterService.addFilters($scope.messenger, relations, $scope.filterKeys, createFilterClause, filterName, queryForData, queryForData);
                    }
                }
            };

            /**
             * Creates and returns a filter on the given field using the value set by this visualization.
             * @param {Object} databaseAndTableName Contains the database and table name
             * @param {String} fieldName The name of the field on which to filter
             * @method createFilterClause
             * @return {Object} A neon.query.Filter object
             * @private
             */
            var createFilterClause = function(databaseAndTableName, fieldName) {
                // The field name may change depending on the related database/table but the value is always the one from the filter.
                return neon.query.where(fieldName, '=', $scope.filter.value);
            };

            /**
             * Removes the filter for this visualization.
             * @method removeFilter
             */
            $scope.removeFilter = function() {
                $scope.filter = undefined;

                if($scope.messenger) {
                    // The Filter Service will remove filters for all filter keys.  Once done, it will query for data.
                    filterService.removeFilters($scope.messenger, $scope.filterKeys, queryForData, queryForData);
                }
            };

            /**
             * Triggered by changing $scope.options.field.
             */
            $scope.onFieldChanged = function() {
                // This function is triggered by updateFields which already start a query so check loadingData to prevent extraneous queries.
                if(!$scope.loadingData) {
                    // Query for data using the new field.
                    queryForData();
                }
            };

            /**
             * Creates and returns an object that contains information needed to export the data in this widget.
             * @return {Object} An object containing all the information needed to export the data in this widget.
             */
            $scope.makeExportObject = function() {
                // Build the normal query and override the limit using the Export Service limit.
                var query = buildQuery();
                query.limitClause = exportService.getLimitClause();

                // Add all fields to be contained in the exported table.
                var fields = [{
                    // The name matching the field in the database.
                    query: $scope.options.field.columnName,
                    // The name to display in the dashboard.
                    pretty: $scope.options.field.prettyName
                }];

                var finalObject = {
                    name: "Sample",
                    data: [{
                        query: query,
                        name: "sample-" + $scope.exportID,
                        fields: fields,
                        ignoreFilters: query.ignoreFilters_,
                        selectionOnly: query.selectionOnly_,
                        ignoredFilterIds: query.ignoredFilterIds_,
                        type: "query"
                    }]
                };

                return finalObject;
            };

            // Initialize the visualization once Neon is ready.  Display the active dataset if any.
            // Visualizations are created in one of two ways:
            // 1) Choosing a dataset replaces all visualizations in the dashboard with new visualizations from the dataset's layout.
            // 2) Adding a new visualization through the Add Visualization navbar item.
            neon.ready(function() {
                initialize();
                displayActiveDataset(true);
            });
        }
    };
}]);
