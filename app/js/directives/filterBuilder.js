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
.directive('filterBuilder', function(DatasetService, FilterService) {
    return {
        templateUrl: 'partials/directives/filterBuilder.html',
        restrict: 'EA',
        scope: {
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
            $scope.selectedFieldIsDate = false;
            $scope.andClauses = true;
            $scope.instanceId = undefined;

            $element.addClass("filter-directive");

            var findDefaultOperator = function(operators) {
                if(operators.indexOf("contains") >= 0) {
                    return "contains";
                }
                return operators[0] || "=";
            };

            var resizeDateTimePickerDropdowns = function() {
                $element.find(".filter").each(function() {
                    var height = $element.height() - $(this).position().top - $(this).height() - 5;
                    $(this).find(".dropdown-menu").css("max-height", height + "px");
                });
            };

            /**
             * Initializes the name of the date field used to query the current dataset
             * and the Neon Messenger used to monitor data change events.
             * @method initialize
             */
            $scope.initialize = function() {
                $scope.instanceId = neon.widget.getInstanceId("filterBuilder");

                $element.resize(resizeDateTimePickerDropdowns);

                $scope.messenger = new neon.eventing.Messenger();
                $scope.filterTable = new neon.query.FilterTable();
                $scope.selectedOperator = findDefaultOperator($scope.filterTable.operatorOptions);

                $scope.messenger.events({
                    connectToHost: onConnectToHost
                });

                $scope.messenger.subscribe(FilterService.REQUEST_REMOVE_FILTER, function(ids) {
                    if(FilterService.containsKey($scope.filterKeys, ids)) {
                        $scope.resetFilters();
                    }
                });

                $scope.$on('$destroy', function() {
                    XDATA.userALE.log({
                        activity: "remove",
                        action: "remove",
                        elementId: "filter-builder",
                        elementType: "panel",
                        elementSub: "filter-builder",
                        elementGroup: "query_group",
                        source: "system",
                        tags: ["remove", "filter-builder"]
                    });

                    $scope.messenger.removeEvents();
                    var databaseAndTableNames = $scope.filterTable.getDatabaseAndTableNames();
                    if(databaseAndTableNames.length) {
                        $scope.publishRemoveFilterEvents($scope.filterTable.getDatabaseAndTableNames());
                    }
                    $element.off("resize", resizeDateTimePickerDropdowns);
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
                if(!DatasetService.hasDataset()) {
                    return;
                }

                $scope.filterTable.clearFilterKeys();
                $scope.filterTable.clearFilterState();

                $scope.databases = DatasetService.getDatabases();
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
                $scope.tables = DatasetService.getTables($scope.selectedDatabase.name);
                $scope.selectedTable = $scope.tables[0];

                for(var i = 0; i < $scope.databases.length; ++i) {
                    for(var j = 0; j < $scope.tables.length; ++j) {
                        $scope.filterTable.setFilterKey($scope.databases[i].name, $scope.tables[j].name, $scope.instanceId + "-" + $scope.databases[i].name + "-" + $scope.tables[j].name);
                    }
                }

                $scope.updateFields();
            };

            $scope.updateTablesForFilterRow = function(filterRow) {
                filterRow.tableOptions = DatasetService.getTables(filterRow.database.name);
                filterRow.tableName = filterRow.tableOptions[0];
                $scope.updateFieldsForFilterRow(filterRow);
            };

            $scope.updateFields = function() {
                $scope.fields = DatasetService.getSortedFields($scope.selectedDatabase.name, $scope.selectedTable.name, true);
                $scope.selectedField = findDefaultField($scope.fields);
            };

            $scope.onSelectedFieldChange = function() {
                XDATA.userALE.log({
                    activity: "select",
                    action: "click",
                    elementId: "filter-builder-selected-field",
                    elementType: "combobox",
                    elementGroup: "query_group",
                    source: "user",
                    tags: ["filter-builder", "field", $scope.selectedfield]
                });

                $scope.selectedFieldIsDate = DatasetService.hasDataset() && $scope.selectedField.columnName === DatasetService.getMapping($scope.selectedDatabase.name, $scope.selectedTable.name, neonMappings.DATE);
            };

            $scope.onSelectedOperatorChange = function() {
                XDATA.userALE.log({
                    activity: "select",
                    action: "click",
                    elementId: "filter-builder-selectedOperator",
                    elementType: "combobox",
                    elementGroup: "query_group",
                    source: "user",
                    tags: ["filter-builder", "operator", $scope.selectedOperator]
                });
            };

            $scope.onSelectedValueChange = function() {
                XDATA.userALE.log({
                    activity: "enter",
                    action: "keydown",
                    elementId: "filter-builder-selectedValue",
                    elementType: "textbox",
                    elementGroup: "query_group",
                    source: "user",
                    tags: ["filter-builder", "value", $scope.selectedValue]
                });
            };

            var findDefaultField = function(fields) {
                return _.find(fields, function(field) {
                    return field.columnName === "text";
                }) || fields[0];
            };

            $scope.updateFieldsForFilterRow = function(filterRow) {
                filterRow.columnOptions = DatasetService.getSortedFields(filterRow.database.name, filterRow.tableName, true);
                filterRow.columnValue = findDefaultField(filterRow.columnOptions);
                $scope.dirtyFilterRow(filterRow);
            };

            var findRelationInfo = function(relation) {
                var info = {
                    databaseObject: {},
                    tableObject: {},
                    tableObjects: DatasetService.getTables(relation.database),
                    databaseFields: DatasetService.getSortedFields(relation.database, relation.table, true)
                };

                for(var i = 0; i < $scope.databases.length; ++i) {
                    if($scope.databases[i].name === relation.database) {
                        info.databaseObject = $scope.databases[i];
                        break;
                    }
                }

                for(i = 0; i < info.tableObjects.length; ++i) {
                    if(info.tableObjects[i].name === relation.table) {
                        info.tableObject = info.tableObjects[i];
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

                if(!database || !table || !$scope.selectedField || !$scope.selectedOperator || !$scope.selectedValue) {
                    return;
                }

                var filterRow = new neon.query.FilterRow(database, table, $scope.selectedField, $scope.selectedOperator, $scope.selectedValue, $scope.tables, $scope.fields);
                filterRow.isDate = $scope.selectedFieldIsDate;
                var rows = [{
                    database: database.name,
                    table: table.name,
                    row: filterRow
                }];

                var relations = DatasetService.getRelations(database.name, table.name, [$scope.selectedField.columnName]);
                relations.forEach(function(relation) {
                    if(relation.database !== database.name || relation.table !== table.name) {
                        var relationInfo = findRelationInfo(relation);
                        relation.fields.forEach(function(relationFields) {
                            relationFields.related.forEach(function(relationField) {
                                var relationFieldObject = _.find(relationInfo.databaseFields, function(databaseField) {
                                    return databaseField.columnName === relationField;
                                });
                                var relationFilterRow = new neon.query.FilterRow(relationInfo.databaseObject, relationInfo.tableObject, relationFieldObject, $scope.selectedOperator, $scope.selectedValue, relationInfo.tableObjects, relationInfo.databaseFields);
                                relationFilterRow.isDate = datasetService.hasDataset() && relationField === datasetService.getMapping(relation.database, relation.table, neonMappings.DATE);
                                rows.push({
                                    database: relationInfo.databaseObject.name,
                                    table: relationInfo.tableObject.name,
                                    row: relationFilterRow
                                });
                            });
                        });
                    }
                });

                var indexes = {};
                rows.forEach(function(row) {
                    if(!indexes[row.database]) {
                        indexes[row.database] = {};
                    }
                    indexes[row.database][row.table] = $scope.filterTable.addFilterRow(row.database, row.table, row.row);
                });

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
                            $scope.selectedField = findDefaultField($scope.fields);
                            $scope.selectedOperator = findDefaultOperator($scope.filterTable.operatorOptions);
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

                var databaseAndTableNames = $scope.filterTable.getDatabaseAndTableNames();
                if(databaseAndTableNames.length) {
                    $scope.publishRemoveFilterEvents(databaseAndTableNames, function(successDatabase, successTable) {
                        $scope.$apply(function() {
                            // Remove the visible filter list.
                            $scope.filterTable.clearFilterState(successDatabase, successTable);
                        });
                    });
                }
            };

            $scope.publishReplaceFilterEvents = function(filters, successCallback, errorCallback) {
                var filterObject = filters.shift();
                var filter = filterObject.filter;

                if(filter.whereClause && filter.whereClause.lhs) {
                    filter.name("Filter Builder: " + filter.whereClause.lhs + " " + filter.whereClause.operator + " " + filter.whereClause.rhs);
                } else if(filter.whereClause && filter.whereClause.whereClauses) {
                    filter.name("Filter Builder: " + filter.whereClause.whereClauses.length + " filters");
                }

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

                $scope.updateFilters();

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
});
