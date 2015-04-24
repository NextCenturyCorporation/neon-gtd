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
            $scope.tableNames = [];
            $scope.selectedTableName = "";
            $scope.fields = [];
            $scope.selectedField = "";
            $scope.andClauses = true;

            /**
             * Initializes the name of the date field used to query the current dataset
             * and the Neon Messenger used to monitor data change events.
             * @method initialize
             */
            $scope.initialize = function() {
                $scope.messenger = new neon.eventing.Messenger();
                $scope.filterTable = new neon.query.FilterTable();
                $scope.selectedOperator = $scope.filterTable.operatorOptions[0] || '=';

                $scope.messenger.events({
                    connectToHost: onConnectToHost
                });
                $scope.messenger.subscribe("dataset_changed", onDatasetChanged);

                $scope.$on('$destroy', function() {
                    $scope.messenger.removeEvents();
                    $scope.publishRemoveFilterEvents($scope.filterTable.getTableNames());
                });

                $scope.$watch('filterTable', function(newVal, oldVal) {
                    if(newVal !== oldVal) {
                        var logData = {
                            to: newVal ? newVal.filterState : {},
                            from: oldVal ? oldVal.filterState : {}
                        };

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

                $scope.$watch('filterTable.filterState', function(state) {
                    XDATA.activityLogger.logSystemActivity('FilterBuilder - updating custom Neon filter count');
                    var count = 0;
                    for(var i = 0; i < $scope.tableNames.length; ++i) {
                        var tableState = state[$scope.tableNames[i]];
                        if(tableState) {
                            count += tableState.length;
                        }
                    }
                    filterCountService.setCount(count);
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
                $scope.filterTable.clearFilterKeys();
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

                $scope.filterTable.clearFilterKeys();
                $scope.filterTable.clearFilterState();

                $scope.databaseName = datasetService.getDatabase();
                $scope.tableNames = [];
                var tables = datasetService.getTables();
                for(var i = 0; i < tables.length; ++i) {
                    var tableName = tables[i].name;
                    $scope.tableNames.push(tableName);
                    $scope.filterTable.setFilterKey(tableName, neon.widget.getInstanceId("filterBuilder") + "-" + tableName);
                }
                $scope.selectedTableName = $scope.tableNames[0];

                $scope.$apply(function() {
                    $scope.updateFields();
                });
            };

            $scope.updateFields = function() {
                var fields = datasetService.getDatabaseFields($scope.selectedTableName);
                $scope.fields = _.without(fields, "_id");
                $scope.selectedField = $scope.fields[0] || "";
            };

            $scope.updateFieldsForFilterRow = function(filterRow) {
                var fields = datasetService.getDatabaseFields(filterRow.tableName);
                filterRow.columnOptions = _.without(fields, "_id");
                filterRow.columnValue = filterRow.columnOptions[0] || "";
                $scope.dirtyFilterRow(filterRow);
            };

            /**
             * Adds a filter row to the table of filter clauses from the current selections.
             * @method addFilterRow
             */
            $scope.addFilterRow = function() {
                var tableName = $scope.selectedTableName;
                var rows = {};
                rows[tableName] = new neon.query.FilterRow($scope.selectedTableName, $scope.selectedField, $scope.selectedOperator, $scope.selectedValue, $scope.andClauses, $scope.fields);

                var relations = datasetService.getRelations($scope.selectedTableName, [$scope.selectedField]);
                for(var i = 0; i < relations.length; ++i) {
                    var relation = relations[i];
                    if(relation.table !== $scope.selectedTableName) {
                        var andClauses = $scope.filterTable.getAndClauses(relation.table);
                        andClauses = typeof andClauses === "undefined" ? $scope.andClauses : andClauses;
                        var databaseFields = datasetService.getDatabaseFields(relation.table);
                        var originalFields = Object.keys(relation.fields);
                        for(var j = 0; j < originalFields.length; ++j) {
                            var relationField = relation.fields[originalFields[j]];
                            rows[relation.table] = new neon.query.FilterRow(relation.table, relationField, $scope.selectedOperator, $scope.selectedValue, andClauses, databaseFields);
                        }
                    }
                }

                var indexes = {};
                var rowTableNames = Object.keys(rows);
                for(var j = 0; j < rowTableNames.length; ++j) {
                    var rowTableName = rowTableNames[j];
                    indexes[rowTableName] = $scope.filterTable.addFilterRow(rowTableName, rows[rowTableName]);
                }

                var filters = $scope.filterTable.buildFiltersFromData($scope.databaseName);

                XDATA.activityLogger.logUserActivity('FilterBuilder - add custom Neon filter', 'execute_query_filter',
                    XDATA.activityLogger.WF_GETDATA, rows[0]);

                $scope.publishReplaceFilterEvents(filters, function(successTable) {
                    // On succesful filter, reset the user input on the add filter row so it's obvious which rows
                    // are filters and which is the primary Add Filter row.
                    if(successTable === tableName) {
                        $scope.$apply(function() {
                            $scope.selectedField = $scope.fields[0];
                            $scope.selectedOperator = $scope.filterTable.operatorOptions[0];
                            $scope.selectedValue = "";
                        });
                    }
                    $scope.cleanFilterRowsForTable(successTable);
                }, function(errorTable) {
                    $scope.$apply(function() {
                        // Error handler:  the addition to the filter failed.  Remove it.
                        if(indexes[errorTable]) {
                            $scope.filterTable.removeFilterRow(errorTable, indexes[errorTable]);
                        }
                    });
                });
            };

            /**
             * Removes a filter row from the table of filter clauses.
             * @param {String} tableName
             * @param {Number} index The row to remove.
             * @method removeFilterRow
             */
            $scope.removeFilterRow = function(tableName, index) {
                var row = $scope.filterTable.removeFilterRow(tableName, index);

                var filters = $scope.filterTable.buildFiltersFromData($scope.databaseName);

                XDATA.activityLogger.logUserActivity('FilterBuilder - reset/clear custom Neon filter', 'remove_query_filter',
                    XDATA.activityLogger.WF_GETDATA, row);

                $scope.publishReplaceFilterEvents(filters, $scope.cleanFilterRowsForTable, function(errorTable) {
                    $scope.$apply(function() {
                        // Error handler:  the removal from the filter failed.  Add it.
                        if(errorTable === tableName) {
                            $scope.filterTable.setFilterRow(tableName, row, index);
                        }
                    });
                });
            };

            /**
             * Updates a filter row from current visible values and resets the filters on the server.
             * @param {String} tableName
             * @param {Number} index The row to update and push to the server.
             * @method updateFilterRow
             */
            $scope.updateFilterRow = function(tableName, index) {
                var row = $scope.filterTable.getFilterRow(tableName, index);
                var oldData = $scope.filterTable.getFilterState(tableName);
                var filters = $scope.filterTable.buildFiltersFromData($scope.databaseName);

                XDATA.activityLogger.logUserActivity('FilterBuilder - update custom Neon filter', 'execute_query_filter',
                    XDATA.activityLogger.WF_GETDATA, row);

                $scope.publishReplaceFilterEvents(filters, $scope.cleanFilterRowsForTable, function(errorTable) {
                    $scope.$apply(function() {
                        // Error handler:  If the new query failed, reset the previous value of the AND / OR field.
                        if(errorTable === tableName) {
                            $scope.filterTable.setFilterState(tableName, oldData);
                        }
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

                $scope.publishRemoveFilterEvents($scope.filterTable.getTableNames(), function(tableName) {
                    $scope.$apply(function() {
                        // Remove the visible filter list.
                        $scope.filterTable.clearFilterState(tableName);
                    });
                });
            };

            $scope.publishReplaceFilterEvents = function(filters, successCallback, errorCallback) {
                var filterObject = filters.shift();
                var filter = filterObject.filter;
                var tableName = filterObject.tableName;
                var filterKey = $scope.filterTable.getFilterKey(tableName);

                XDATA.activityLogger.logSystemActivity('FilterBuilder - create/replace custom Neon filter set');
                $scope.messenger.replaceFilter(filterKey, filter, function() {
                    XDATA.activityLogger.logSystemActivity('FilterBuilder - custom Neon filter set changed');
                    if(successCallback) {
                        successCallback(tableName);
                    }
                    if(filters.length) {
                        $scope.publishReplaceFilterEvents(filters, successCallback, errorCallback)
                    }
                }, function() {
                    XDATA.activityLogger.logSystemActivity('FilterBuilder - failed to change custom Neon filter set');
                    // TODO: Notify the user of the error.
                    if(errorCallback) {
                        errorCallback(tableName);
                    }
                    if(filters.length) {
                        $scope.publishReplaceFilterEvents(filters, successCallback, errorCallback)
                    }
                });
            };

            $scope.publishRemoveFilterEvents = function(tableNames, successCallback) {
                var tableName = tableNames.shift();
                var filterKey = $scope.filterTable.getFilterKey(tableName);

                $scope.messenger.removeFilter(filterKey, function() {
                    XDATA.activityLogger.logSystemActivity('FilterBuilder - custom Neon filter set changed');
                    if(successCallback) {
                        successCallback(tableName);
                    }
                    if(tableNames.length) {
                        $scope.publishRemoveFilterEvents(tableNames, successCallback)
                    }
                }, function() {
                    XDATA.activityLogger.logSystemActivity('FilterBuilder - failed to change custom Neon filter set');
                    // TODO: Notify the user of the error.
                    if(filters.length) {
                        $scope.publishRemoveFilterEvents(tableNames, successCallback)
                    }
                });
            };

            $scope.dirtyFilterRow = function(filterRow) {
                filterRow.dirty = true;
            };

            $scope.cleanFilterRowsForTable = function(tableName) {
                var filterRows = $scope.filterTable.getFilterState(tableName);
                for(var i = 0; i < filterRows.length; ++i) {
                    filterRows[i].dirty = false;
                }
            };

            $scope.updateAndClauses = function() {
                var filterRows = $scope.filterTable.getFilterState($scope.selectedTableName);
                for(var i = 0; i < filterRows.length; ++i) {
                    if(filterRows[i].andClauses !== $scope.andClauses) {
                        filterRows[i].dirty = true;
                    }
                    filterRows[i].andClauses = $scope.andClauses;
                }
            };

            $scope.updateAndClausesForFilterRow = function(filterRow) {
                filterRow.dirty = true;
                var andClauses = filterRow.andClauses;
                if($scope.selectedTableName === filterRow.tableName) {
                    $scope.andClauses = andClauses;
                }

                var filterRows = $scope.filterTable.getFilterState(filterRow.tableName);
                for(var i = 0; i < filterRows.length; ++i) {
                    if(filterRows[i].andClauses !== andClauses) {
                        filterRows[i].dirty = true;
                    }
                    filterRows[i].andClauses = andClauses;
                }
            };

            // Wait for neon to be ready, the create our messenger and intialize the view and data.
            neon.ready(function() {
                $scope.initialize();
            });
        }
    };
}]);
