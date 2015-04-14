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
 * This Angular JS directive adds a basic Neon filter builder pane to a page.  The pane allows as user
 * to associate basic operators (e.g., >, <, =) and comparison values with table fields on any
 * open database connection.
 *
 * @example
 *    &lt;filter-builder&gt;&lt;/filter-builder&gt;<br>
 *    &lt;div filter-builder&gt;&lt;/div&gt;
 *
 * @class neonDemo.directives.filterBuilder
 * @constructor
 */
angular.module('neonDemo.directives')
.directive('filterBuilder', ['DatasetService', 'FilterCountService', function(datasetService, filterCountService) {
    return {
        templateUrl: 'partials/directives/filterBuilder.html',
        restrict: 'EA',
        scope: {
        },
        controller: 'neonDemoController',
        link: function($scope, el) {
            $scope.databaseName = "";
            $scope.tables = [];
            $scope.selectedTable = {
                name: ""
            };
            $scope.fields = [];
            $scope.selectedField = "Select Field";
            $scope.andClauses = true;

            /**
             * Initializes the name of the date field used to query the current dataset
             * and the Neon Messenger used to monitor data change events.
             * @method initialize
             */
            $scope.initialize = function() {
                $scope.messenger = new neon.eventing.Messenger();
                $scope.filterTable = new neon.query.FilterTable();
                // Use a single session based filter key for this directive instance to allow multiple
                // filter sets to be used in the same application.
                $scope.filterTable.setFilterKey(neon.widget.getInstanceId("filterBuilder"));
                $scope.selectedOperator = $scope.filterTable.operatorOptions[0] || '=';

                $scope.messenger.events({
                    connectToHost: onConnectToHost
                });
                $scope.messenger.subscribe("dataset_changed", onDatasetChanged);

                $scope.$on('$destroy', function() {
                    $scope.messenger.removeEvents();
                    $scope.messenger.removeFilter($scope.filterTable.filterKey);
                });

                // Adjust the filters whenever the user toggles AND/OR clauses.
                $scope.$watch('andClauses', function(newVal, oldVal) {
                    if(newVal !== oldVal) {
                        var filter = $scope.filterTable.buildFilterFromData($scope.databaseName, $scope.selectedTable.name, $scope.andClauses);

                        XDATA.activityLogger.logUserActivity('FilterBuilder - Toggle custom Neon filter set operator', 'select_filter_menu_option',
                            XDATA.activityLogger.WF_GETDATA,
                            {
                                operator: newVal
                            });
                        XDATA.activityLogger.logSystemActivity('FilterBuilder - create/replace custom Neon filter set');
                        $scope.messenger.replaceFilter($scope.filterTable.filterKey, filter, function() {
                            // No action required at present.
                            XDATA.activityLogger.logSystemActivity('FilterBuilder - custom Neon filter set changed');
                        }, function() {
                            $scope.$apply(function() {
                                XDATA.activityLogger.logSystemActivity('FilterBuilder - failed to change custom Neon filter set');

                                // Error handler:  If the new query failed, reset the previous value of the AND / OR field.
                                $scope.andClauses = !$scope.andClauses;

                                // TODO: Notify the user of the error.
                            });
                        });
                    }
                });

                $scope.$watch('filterTable', function(newVal, oldVal) {
                    if(newVal !== oldVal) {
                        var logData = {};
                        if(newVal && newVal.filterState && newVal.filterState.data[0]) {
                            logData.to = newVal.filterState.data[0];
                        }
                        if(oldVal && oldVal.filterState && oldVal.filterState.data[0]) {
                            logData.from = oldVal.filterState.data[0];
                        }

                        // Log filter modifications. Determine the activitiy to log for modifications to filters,
                        // menu selection or new filter text,
                        // based upon whether the filter value changed or not.
                        if(logData.to && logData.from) {
                            var activity = (logData.to.value !== logData.from.value) ? 'enter_filter_text' : 'select_filter_menu_option';
                            XDATA.activityLogger.logUserActivity('FilterBuilder - Modifying custom Neon filter data',
                                activity,
                                XDATA.activityLogger.WF_GETDATA,
                                logData);
                        }
                        $(el).find('.tray-mirror.filter-tray .inner').height($('#filter-tray > .container').outerHeight(true));
                    }
                }, true);

                $scope.$watch('filterTable.filterState.data', function(rows) {
                    XDATA.activityLogger.logSystemActivity('FilterBuilder - updating custom Neon filter count');
                    filterCountService.setCount(rows.length);
                }, true);

                $scope.$watch('[selectedField, selectedOperator, selectedValue]', function(newVal, oldVal) {
                    if(newVal !== oldVal) {
                        var logData = {};
                        if(newVal) {
                            logData.to = newVal;
                        }
                        if(oldVal) {
                            logData.from = oldVal;
                        }
                        XDATA.activityLogger.logUserActivity('FilterBuilder - Entering new custom Neon filter data',
                            'select_filter_menu_option',
                            XDATA.activityLogger.WF_GETDATA,
                            logData);
                    }
                }, true);

                $scope.$watch('selectedValue', function(newVal, oldVal) {
                    if(newVal !== oldVal) {
                        var logData = {};
                        if(newVal) {
                            logData.to = newVal;
                        }
                        if(oldVal) {
                            logData.from = oldVal;
                        }

                        XDATA.activityLogger.logUserActivity('FilterBuilder - Entering new custom Neon filter data',
                            'enter_filter_text',
                            XDATA.activityLogger.WF_GETDATA,
                            logData);
                    }
                }, true);
            };

            /**
             * Event handler for connect to host events issued over Neon's messaging channels.
             * @method onConnectToHost
             * @private
             */
            var onConnectToHost = function() {
                XDATA.activityLogger.logSystemActivity('FilterBuilder - received neon connect to host event');
                $scope.filterTable.clearFilterState();
            };

            /**
             * Event handler for dataset changed events issued over Neon's messaging channels.
             * @method onDatasetChanged
             * @private
             */
            var onDatasetChanged = function() {
                XDATA.activityLogger.logSystemActivity('FilterBuilder - received neon-gtd dataset changed event');

                if(!datasetService.hasDataset()) {
                    return;
                }

                $scope.filterTable.clearFilterState();

                // Save the new database and table name; Fetch the new table fields.
                $scope.databaseName = datasetService.getDatabase();
                $scope.tables = datasetService.getTables();
                $scope.selectedTable = $scope.tables[0];

                $scope.$apply(function() {
                    $scope.updateFields();
                });
            };

            $scope.updateFields = function() {
                var fields = datasetService.getDatabaseFields($scope.selectedTable.name);
                $scope.fields = _.without(fields, "_id");
                $scope.selectedField = fields[0];
            };

            $scope.resetFiltersAndUpdateFields = function() {
                $scope.resetFilters();
                $scope.updateFields();
            };

            /**
             * Adds a filter row to the table of filter clauses from the current selections.
             * @method addFilterRow
             */
            $scope.addFilterRow = function() {
                var row = new neon.query.FilterRow($scope.selectedField, $scope.selectedOperator, $scope.selectedValue);
                $scope.filterTable.addFilterRow(row);

                var filter = $scope.filterTable.buildFilterFromData($scope.databaseName, $scope.selectedTable.name, $scope.andClauses);

                XDATA.activityLogger.logUserActivity('FilterBuilder - add custom Neon filter', 'execute_query_filter',
                    XDATA.activityLogger.WF_GETDATA,
                    row);
                XDATA.activityLogger.logSystemActivity('FilterBuilder - create/replace custom Neon filter set');
                $scope.messenger.replaceFilter($scope.filterTable.filterKey, filter, function() {
                    // On succesful filter, reset the user input on the add filter row so it's obvious which rows
                    // are filters and which is the primary Add Filter row.
                    $scope.$apply(function() {
                        XDATA.activityLogger.logSystemActivity('FilterBuilder - custom Neon filter set changed');
                        $scope.selectedField = $scope.fields[0];
                        $scope.selectedOperator = $scope.filterTable.operatorOptions[0];
                        $scope.selectedValue = "";
                    });
                }, function() {
                    $scope.$apply(function() {
                        // Error handler:  the addition to the filter failed.  Remove it.
                        $scope.filterTable.removeFilterRow($scope.filterTable.filterState.data.length - 1);

                        XDATA.activityLogger.logSystemActivity('FilterBuilder - failed to change custom Neon filter set');
                        // TODO: Notify the user.
                    });
                });
            };

            /**
             * Removes a filter row from the table of filter clauses.
             * @param {Number} index The row to remove.
             * @method updateFilterRow
             */
            $scope.removeFilterRow = function(index) {
                var row = $scope.filterTable.removeFilterRow(index);

                // Make the neon call to remove it from the server.
                var filter = $scope.filterTable.buildFilterFromData($scope.databaseName, $scope.selectedTable.name, $scope.andClauses);

                XDATA.activityLogger.logUserActivity('FilterBuilder - reset/clear custom Neon filter', 'remove_query_filter',
                    XDATA.activityLogger.WF_GETDATA, row);
                XDATA.activityLogger.logSystemActivity('FilterBuilder - create/replace custom Neon filter set');
                $scope.messenger.replaceFilter($scope.filterTable.filterKey, filter, function() {
                    XDATA.activityLogger.logSystemActivity('FilterBuilder - custom Neon filter set changed');
                }, function() {
                    $scope.$apply(function() {
                        // Error handler:  the addition to the filter failed.  Remove it.
                        $scope.filterTable.setFilterRow(row, index);
                        XDATA.activityLogger.logSystemActivity('FilterBuilder - failed to change custom Neon filter set');
                        // TODO: Notify the user.
                    });
                });
            };

            /**
             * Updates a filter row from current visible values and resets the filters on the server.
             * @param {Number} index The row to update and push to the server.
             * @method updateFilterRow
             */
            $scope.updateFilterRow = function(index) {
                var row = $scope.filterTable.getFilterRow(index);
                var oldVal = $scope.filterTable.filterState;
                var filter = $scope.filterTable.buildFilterFromData($scope.databaseName, $scope.selectedTable.name, $scope.andClauses);

                XDATA.activityLogger.logUserActivity('FilterBuilder - update custom Neon filter', 'execute_query_filter',
                    XDATA.activityLogger.WF_GETDATA, row);
                XDATA.activityLogger.logSystemActivity('FilterBuilder - create/replace custom Neon filter set');
                $scope.messenger.replaceFilter($scope.filterTable.filterKey, filter, function() {
                    // No action required at present.
                    XDATA.activityLogger.logSystemActivity('FilterBuilder - custom Neon filter set changed');
                }, function() {
                    $scope.$apply(function() {
                        // Error handler:  If the new query failed, reset the previous value of the AND / OR field.
                        $scope.filterTable.filterState = oldVal;
                        XDATA.activityLogger.logSystemActivity('FilterBuilder - failed to change custom Neon filter set');
                        // TODO: Notify the user of the error.
                    });
                });
            };

            /**
             * Resets the current filter.
             * @method resetFilters
             */
            $scope.resetFilters = function() {
                XDATA.activityLogger.logUserActivity('FilterBuilder - reset/clear all custom Neon filters', 'remove_query_filter',
                    XDATA.activityLogger.WF_GETDATA);
                XDATA.activityLogger.logSystemActivity('FilterBuilder - create/replace custom Neon filter set');
                $scope.messenger.removeFilter($scope.filterTable.filterKey, function() {
                    $scope.$apply(function() {
                        // Remove the visible filter list.
                        $scope.filterTable.clearFilterState();
                        XDATA.activityLogger.logSystemActivity('FilterBuilder - custom Neon filter set changed');
                    });
                }, function() {
                    // TODO: Notify the user of the error.
                    XDATA.activityLogger.logSystemActivity('FilterBuilder - failed to change custom Neon filter set');
                });
            };

            // Wait for neon to be ready, the create our messenger and intialize the view and data.
            neon.ready(function() {
                $scope.initialize();
            });
        }
    };
}]);
