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
 * @namespace neonDemo.directives
 * @class filterBuilder
 * @constructor
 */
angular.module('neonDemo.directives')
.directive('filterBuilder', ['DatasetService', function(datasetService) {
    return {
        templateUrl: 'partials/directives/filterBuilder.html',
        restrict: 'EA',
        scope: {
            navbarItem: '=?',
            filterCount: '=?'
        },
        controller: 'neonDemoController',
        link: function($scope, $element) {
            $scope.databases = [];
            $scope.tables = [];
            $scope.selectedDatabase = {};
            $scope.selectedTable = {};
            $scope.fields = [];
            $scope.selectedField = "";
            $scope.andClauses = false;

            if(!($scope.navbarItem)) {
                $element.addClass("filter-directive");
            }

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

                $scope.$on('$destroy', function() {
                    XDATA.userALE.log({
                        activity: "remove",
                        action: "click",
                        elementId: "filter-builder",
                        elementType: "panel",
                        elementSub: "filter-builder",
                        elementGroup: "query_group",
                        source: "user",
                        tags: ["remove", "filter-builder"]
                    });

                    $scope.messenger.removeEvents();
                    $scope.publishRemoveFilterEvents($scope.filterTable.getDatabaseAndTableNames());
                });

                $scope.$watch('filterTable', function(newVal, oldVal) {
                    if(newVal !== oldVal) {
                        $element.find('.tray-mirror.filter-tray .inner').height($('#filter-tray > .container').outerHeight(true));
                    }
                }, true);

                $scope.$watch('filterTable.filterState', function(state) {
                    var count = 0;
                    for(var i = 0; i < $scope.tables.length; ++i) {
                        var tableState = state[$scope.tables[i].name];
                        if(tableState) {
                            count += tableState.length;
                        }
                    }
                    $scope.filterCount = count;
                }, true);

                $scope.$watch('selectedField', function(newVal) {
                    XDATA.userALE.log({
                        activity: "select",
                        action: "click",
                        elementId: "filter-builder-selected-field",
                        elementType: "combobox",
                        elementGroup: "query_group",
                        source: "user",
                        tags: ["filter-builder", "field", newVal]
                    });
                });

                $scope.$watch('selectedOperator', function(newVal) {
                    XDATA.userALE.log({
                        activity: "select",
                        action: "click",
                        elementId: "filter-builder-selectedOperator",
                        elementType: "combobox",
                        elementGroup: "query_group",
                        source: "user",
                        tags: ["filter-builder", "operator", newVal]
                    });
                });

                $scope.$watch('selectedValue', function(newVal) {
                    XDATA.userALE.log({
                        activity: "enter",
                        action: "keydown",
                        elementId: "filter-builder-selectedValue",
                        elementType: "textbox",
                        elementGroup: "query_group",
                        source: "user",
                        tags: ["filter-builder", "value", newVal]
                    });
                });
            };

            /**
             * Event handler for connect to host events issued over Neon's messaging channels.
             * @method onConnectToHost
             * @private
             */
            var onConnectToHost = function() {
                $scope.filterTable.clearFilterKeys();
                $scope.filterTable.clearFilterState();
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

                $scope.filterTable.clearFilterKeys();
                $scope.filterTable.clearFilterState();

                $scope.databases = datasetService.getDatabases();
                $scope.selectedDatabase = $scope.databases[0];

                if(initializing) {
                    $scope.updateTables();
                } else {
                    $scope.$apply(function() {
                        $scope.updateTables();
                    });
                }
            };

            $scope.updateTables = function() {
                $scope.tables = datasetService.getTables($scope.selectedDatabase.name);
                $scope.selectedTable = $scope.tables[0];

                for(var i = 0; i < $scope.databases.length; ++i) {
                    for(var j = 0; j < $scope.tables.length; ++j) {
                        $scope.filterTable.setFilterKey($scope.databases[i].name, $scope.tables[j].name, neon.widget.getInstanceId("filterBuilder") + "-" + $scope.databases[i].name + "-" + $scope.tables[j].name);
                    }
                }

                $scope.updateFields();
            };

            $scope.updateTablesForFilterRow = function(filterRow) {
                filterRow.tableOptions = datasetService.getTables(filterRow.database.name);
                filterRow.tableName = filterRow.tableOptions[0];
                $scope.updateFieldsForFilterRow(filterRow);
            };

            $scope.updateFields = function() {
                var fields = datasetService.getDatabaseFields($scope.selectedDatabase.name, $scope.selectedTable.name);
                $scope.fields = _.without(fields, "_id");
                $scope.fields.sort();
                if($scope.fields.indexOf("text") >= 0) {
                    $scope.selectedField = "text";
                } else {
                    $scope.selectedField = $scope.fields[0] || "";
                }
            };

            $scope.updateFieldsForFilterRow = function(filterRow) {
                var fields = datasetService.getDatabaseFields(filterRow.database.name, filterRow.tableName);
                filterRow.columnOptions = _.without(fields, "_id");
                filterRow.columnOptions.sort();
                filterRow.columnValue = filterRow.columnOptions[0] || "";
                $scope.dirtyFilterRow(filterRow);
            };

            var findRelationInfo = function(relation) {
                var info = {
                    database: {},
                    table: {},
                    tables: datasetService.getTables(relation.database),
                    databaseFields: datasetService.getDatabaseFields(relation.database, relation.table),
                    originalFields: Object.keys(relation.fields)
                };

                for(var i = 0; i < $scope.databases.length; ++i) {
                    if($scope.databases[i].name === relation.database) {
                        info.database = $scope.databases[i];
                        break;
                    }
                }

                for(i = 0; i < info.tables.length; ++i) {
                    if(info.tables[i].name === relation.table) {
                        info.table = info.tables[i];
                        break;
                    }
                }

                return info;
            };

            /**
             * Adds a filter row to the table of filter clauses from the current selections.
             * @method addFilterRow
             */
            $scope.addFilterRow = function() {
                var database = $scope.selectedDatabase;
                var table = $scope.selectedTable;

                var filterRow = new neon.query.FilterRow(database, table, $scope.selectedField, $scope.selectedOperator, $scope.selectedValue, $scope.tables, $scope.fields);
                var rows = [{
                    database: database,
                    table: table,
                    row: filterRow
                }];

                var relations = datasetService.getRelations(database.name, table.name, [$scope.selectedField]);
                for(var i = 0; i < relations.length; ++i) {
                    var relation = relations[i];
                    if(relation.database !== database.name || relation.table !== table.name) {
                        var relationInfo = findRelationInfo(relation);
                        for(var j = 0; j < relationInfo.originalFields.length; ++j) {
                            var relationFields = relation.fields[relationInfo.originalFields[j]];
                            for(var k = 0; k < relationFields.length; ++k) {
                                var relationFilterRow = new neon.query.FilterRow(relationInfo.database, relationInfo.table, relationFields[k], $scope.selectedOperator, $scope.selectedValue, relationInfo.tables, relationInfo.databaseFields);
                                rows.push({
                                    database: relationInfo.database,
                                    table: relationInfo.table,
                                    row: relationFilterRow
                                });
                            }
                        }
                    }
                }

                var indexes = {};
                for(var l = 0; l < rows.length; ++l) {
                    if(!indexes[rows[l].database]) {
                        indexes[rows[l].database] = {};
                    }
                    indexes[rows[l].database][rows[l].table] = $scope.filterTable.addFilterRow(rows[l].database.name, rows[l].table.name, rows[l].row);
                }

                var filters = $scope.filterTable.buildFiltersFromData($scope.andClauses);

                XDATA.userALE.log({
                    activity: "add",
                    action: "click",
                    elementId: "filter-builder-add-filter",
                    elementType: "button",
                    elementGroup: "query_group",
                    source: "user",
                    tags: ["filter-builder", "filter", "add"]
                });

                $scope.publishReplaceFilterEvents(filters, function(successDatabase, successTable) {
                    // On succesful filter, reset the user input on the add filter row so it's obvious which rows
                    // are filters and which is the primary Add Filter row.
                    if(successDatabase === database.name, successTable === table.name) {
                        $scope.$apply(function() {
                            $scope.selectedField = $scope.fields[0];
                            $scope.selectedOperator = $scope.filterTable.operatorOptions[0];
                            $scope.selectedValue = "";
                        });
                    }
                    $scope.cleanFilterRowsForTable(successDatabase, successTable);
                }, function(errorDatabase, errorTable) {
                    $scope.$apply(function() {
                        // Error handler:  the addition to the filter failed.  Remove it.
                        if(indexes[errorDatabase] && indexes[errorDatabase][errorTable]) {
                            $scope.filterTable.removeFilterRow(errorDatabase, errorTable, indexes[errorDatabase][errorTable]);
                        }
                    });
                });
            };

            /**
             * Removes a filter row from the table of filter clauses.
             * @param {String} databaseName
             * @param {String} tableName
             * @param {Number} index The row to remove.
             * @method removeFilterRow
             */
            $scope.removeFilterRow = function(databaseName, tableName, index) {
                var row = $scope.filterTable.removeFilterRow(databaseName, tableName, index);

                var filters = $scope.filterTable.buildFiltersFromData($scope.andClauses);

                XDATA.userALE.log({
                    activity: "remove",
                    action: "click",
                    elementId: "filter-builder-remove-filter",
                    elementType: "button",
                    elementGroup: "query_group",
                    source: "user",
                    tags: ["filter-builder", "filter", "remove"]
                });

                $scope.publishReplaceFilterEvents(filters, $scope.cleanFilterRowsForTable, function(errorDatabase, errorTable) {
                    $scope.$apply(function() {
                        // Error handler:  the removal from the filter failed.  Add it.
                        if(errorDatabase === databaseName && errorTable === tableName) {
                            $scope.filterTable.setFilterRow(databaseName, tableName, row, index);
                        }
                    });
                });
            };

            /**
             * Updates a filter row from current visible values and resets the filters on the server.
             * @param {String} databaseName
             * @param {String} tableName
             * @param {Number} index The row to update and push to the server.
             * @method updateFilterRow
             */
            $scope.updateFilterRow = function(databaseName, tableName, index) {
                XDATA.userALE.log({
                    activity: "alter",
                    action: "click",
                    elementId: "filter-builder-update-filter-" + index,
                    elementType: "button",
                    elementGroup: "query_group",
                    source: "user",
                    tags: ["filter-builder", "filter", "update"]
                });

                $scope.updateFilters(databaseName, tableName);
            };

            /**
             * Updates all the filters.
             * @param {String} databaseName (optional)
             * @param {String} tableName (optional)
             * @method updateFilters
             */
            $scope.updateFilters = function(databaseName, tableName) {
                var oldData = (databaseName && tableName) ? $scope.filterTable.getFilterState(databaseName, tableName) : {};
                var filters = $scope.filterTable.buildFiltersFromData($scope.andClauses);

                if(filters.length) {
                    $scope.publishReplaceFilterEvents(filters, $scope.cleanFilterRowsForTable, function(errorDatabase, errorTable) {
                        $scope.$apply(function() {
                            // Error handler:  If the new query failed, reset the previous value of the filter.
                            if(databaseName && errorDatabase === databaseName && tableName && errorTable === tableName) {
                                $scope.filterTable.setFilterState(databaseName, tableName, oldData);
                            }
                        });
                    });
                }
            };

            /**
             * Resets the current filter.
             * @method resetFilters
             */
            $scope.resetFilters = function() {
                XDATA.userALE.log({
                    activity: "remove",
                    action: "click",
                    elementId: "filter-builder-clear-all",
                    elementType: "button",
                    elementGroup: "query_group",
                    source: "user",
                    tags: ["filter-builder", "filter", "clear"]
                });

                $scope.publishRemoveFilterEvents($scope.filterTable.getDatabaseAndTableNames(), function(successDatabase, successTable) {
                    $scope.$apply(function() {
                        // Remove the visible filter list.
                        $scope.filterTable.clearFilterState(successDatabase, successTable);
                    });
                });
            };

            $scope.publishReplaceFilterEvents = function(filters, successCallback, errorCallback) {
                var filterObject = filters.shift();
                var filter = filterObject.filter;
                var databaseName = filterObject.databaseName;
                var tableName = filterObject.tableName;
                var filterKey = $scope.filterTable.getFilterKey(databaseName, tableName);

                XDATA.userALE.log({
                    activity: "alter",
                    action: "filter",
                    elementId: "filter-builder",
                    elementType: "panel",
                    elementGroup: "query_group",
                    source: "system",
                    tags: ["filter", "filter-builder"]
                });
                $scope.messenger.replaceFilter(filterKey, filter, function() {
                    XDATA.userALE.log({
                        activity: "alter",
                        action: "receive",
                        elementId: "filter-builder",
                        elementType: "panel",
                        elementGroup: "query_group",
                        source: "system",
                        tags: ["receive", "filter-builder"]
                    });
                    if(successCallback) {
                        successCallback(databaseName, tableName);
                    }
                    if(filters.length) {
                        $scope.publishReplaceFilterEvents(filters, successCallback, errorCallback);
                    }
                }, function() {
                    XDATA.userALE.log({
                        activity: "alter",
                        action: "failed",
                        elementId: "filter-builder",
                        elementType: "panel",
                        elementGroup: "query_group",
                        source: "system",
                        tags: ["failed", "filter-builder"]
                    });
                    // TODO: Notify the user of the error.
                    if(errorCallback) {
                        errorCallback(databaseName, tableName);
                    }
                    if(filters.length) {
                        $scope.publishReplaceFilterEvents(filters, successCallback, errorCallback);
                    }
                });
            };

            $scope.publishRemoveFilterEvents = function(databaseAndTableNames, successCallback) {
                var databaseAndTableName = databaseAndTableNames.shift();
                var filterKey = $scope.filterTable.getFilterKey(databaseAndTableName.database, databaseAndTableName.table);

                XDATA.userALE.log({
                    activity: "remove",
                    action: "clear",
                    elementId: "filter-builder",
                    elementType: "panel",
                    elementGroup: "query_group",
                    source: "system",
                    tags: ["filter", "filter-builder"]
                });
                $scope.messenger.removeFilter(filterKey, function() {
                    if(successCallback) {
                        successCallback(databaseAndTableName.database, databaseAndTableName.table);
                    }
                    if(databaseAndTableNames.length) {
                        $scope.publishRemoveFilterEvents(databaseAndTableNames, successCallback);
                    }
                }, function() {
                    XDATA.userALE.log({
                        activity: "remove",
                        action: "failed",
                        elementId: "filter-builder",
                        elementType: "panel",
                        elementGroup: "query_group",
                        source: "system",
                        tags: ["failed", "filter-builder"]
                    });
                    // TODO: Notify the user of the error.
                    if(databaseAndTableNames.length) {
                        $scope.publishRemoveFilterEvents(databaseAndTableNames, successCallback);
                    }
                });
            };

            $scope.dirtyFilterRow = function(filterRow) {
                filterRow.dirty = true;
            };

            $scope.cleanFilterRowsForTable = function(databaseName, tableName) {
                var filterRows = $scope.filterTable.getFilterState(databaseName, tableName);
                for(var i = 0; i < filterRows.length; ++i) {
                    filterRows[i].dirty = false;
                }
            };

            $scope.updateAndClauses = function() {
                XDATA.userALE.log({
                    activity: "alter",
                    action: "click",
                    elementId: "filter-builder-and-clauses",
                    elementType: "button",
                    elementGroup: "query_group",
                    source: "user",
                    tags: ["filter-builder", "filter", "update"]
                });

                // For the Filter Builder visualization, automatically update all the filters.
                if(!$scope.navbarItem) {
                    $scope.updateFilters();
                    return;
                }

                var databaseAndTableNames = $scope.filterTable.getDatabaseAndTableNames();
                for(var i = 0; i < databaseAndTableNames.length; ++i) {
                    var databaseAndTableName = databaseAndTableNames[i];
                    var filterRows = $scope.filterTable.getFilterState(databaseAndTableName.database, databaseAndTableName.table);
                    for(var j = 0; j < filterRows.length; ++j) {
                        filterRows[j].dirty = true;
                    }
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
