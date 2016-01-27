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
.directive('filterBuilder', ["DatasetService", "FilterService", function(datasetService, filterService) {
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
             * @private
             */
            var initialize = function() {
                $scope.instanceId = neon.widget.getInstanceId("filterBuilder");

                $element.resize(resizeDateTimePickerDropdowns);

                $scope.messenger = new neon.eventing.Messenger();
                $scope.filterTable = new neon.query.FilterTable();
                $scope.selectedOperator = findDefaultOperator($scope.filterTable.operatorOptions);

                $scope.messenger.events({
                    connectToHost: onConnectToHost,
                    filtersChanged: onFiltersChanged
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

                    $scope.messenger.unsubscribeAll();
                    var databaseAndTableNames = $scope.filterTable.getDatabaseAndTableNames();
                    if(databaseAndTableNames.length) {
                        publishRemoveFilterEvents(databaseAndTableNames);
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
             * Event handler for filter changed events issued over Neon's messaging channels.
             * @param {Object} message A Neon filter changed message.
             * @method onFiltersChanged
             * @private
             */
            var onFiltersChanged = function(message) {
                if(message && message.type === "REMOVE") {
                    var filters = $scope.filterTable.buildFiltersFromData($scope.andClauses);

                    _.each(filters, function(filter) {
                        var databaseName = filter.filter.databaseName;
                        var tableName = filter.filter.tableName;

                        if(message.removedFilter.databaseName === databaseName && message.removedFilter.tableName === tableName &&
                            filterService.areClausesEqual(message.removedFilter.whereClause, filter.filter.whereClause)) {
                            $scope.filterTable.clearFilterState(databaseName, tableName);
                        }
                    });
                }
            };

            /*
             * Finds, parses, and adds any filters that belong to the filter builder.
             * @method displaySavedFilters
             * @private
             */
            var displaySavedFilters = function() {
                _.each(filterService.getAllFilters(), function(filter) {
                    if(filter.filter.filterName.indexOf(filterService.filterBuildPrefix) === 0) {
                        $scope.instanceId = filter.id;
                        $scope.filterTable.setFilterKey(filter.filter.databaseName, filter.filter.tableName, $scope.instanceId);

                        $scope.selectedDatabase = datasetService.getDatabaseWithName(filter.filter.databaseName);
                        $scope.selectedTable = datasetService.getTableWithName(filter.filter.databaseName, filter.filter.tableName);
                        $scope.tables = datasetService.getTables(filter.filter.databaseName);
                        $scope.fields = datasetService.getFields(filter.filter.databaseName, filter.filter.tableName);
                        $scope.selectedFieldIsDate = false;

                        if(filterService.hasSingleClause(filter)) {
                            $scope.selectedField = datasetService.findField($scope.fields, filter.filter.whereClause.lhs);
                            $scope.selectedOperator = filter.filter.whereClause.operator;
                            $scope.selectedValue = filter.filter.whereClause.rhs;
                            $scope.addFilterRow($scope.instanceId);
                        } else {
                            $scope.andClauses = (filterService.hasMultipleClauses(filter) ? true : false);
                            _.each(filter.filter.whereClause.whereClauses, function(clause) {
                                $scope.selectedField = datasetService.findField($scope.fields, clause.lhs);
                                $scope.selectedOperator = clause.operator;
                                $scope.selectedValue = clause.rhs;
                                $scope.addFilterRow($scope.instanceId);
                            });
                        }
                    }
                });
            };

            /**
             * Displays data for any currently active datasets.
             * @method displayActiveDataset
             * @private
             */
            var displayActiveDataset = function() {
                if(!datasetService.hasDataset()) {
                    return;
                }

                $scope.filterTable.clearFilterKeys();
                $scope.filterTable.clearFilterState();

                $scope.databases = datasetService.getDatabases();
                $scope.selectedDatabase = $scope.databases[0];
                $scope.updateTables();
                displaySavedFilters();
            };

            $scope.updateTables = function() {
                $scope.tables = datasetService.getTables($scope.selectedDatabase.name);
                $scope.selectedTable = $scope.tables[0];

                for(var i = 0; i < $scope.databases.length; ++i) {
                    var databaseTables = datasetService.getTables($scope.databases[i].name);
                    for(var j = 0; j < databaseTables.length; ++j) {
                        $scope.filterTable.setFilterKey($scope.databases[i].name, databaseTables[j].name, $scope.instanceId + "-" + $scope.databases[i].name + "-" + databaseTables[j].name);
                    }
                }

                $scope.updateFields();
            };

            $scope.updateTablesForFilterRow = function(filterRow) {
                filterRow.tableOptions = datasetService.getTables(filterRow.database.name);
                filterRow.table = filterRow.tableOptions[0];
                $scope.updateFieldsForFilterRow(filterRow);
            };

            $scope.updateFields = function() {
                $scope.fields = datasetService.getSortedFields($scope.selectedDatabase.name, $scope.selectedTable.name, true);
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

                $scope.selectedFieldIsDate = datasetService.hasDataset() && $scope.selectedField.columnName === datasetService.getMapping($scope.selectedDatabase.name, $scope.selectedTable.name, neonMappings.DATE);
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
                $scope.filterTable.updateFilterRow(filterRow);
                filterRow.columnOptions = datasetService.getSortedFields(filterRow.database.name, filterRow.table.name, true);
                filterRow.columnValue = findDefaultField(filterRow.columnOptions);
                $scope.dirtyFilterRow(filterRow);
            };

            var findRelationInfo = function(relation) {
                var info = {
                    databaseObject: {},
                    tableObject: {},
                    tableObjects: datasetService.getTables(relation.database),
                    databaseFields: datasetService.getSortedFields(relation.database, relation.table, true)
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

                var relations = datasetService.getRelations(database.name, table.name, [$scope.selectedField.columnName]);
                relations.forEach(function(relation) {
                    var relationInfo = findRelationInfo(relation);
                    relation.fields.forEach(function(relationFields) {
                        relationFields.related.forEach(function(relationField) {
                            if(relation.database !== database.name || relation.table !== table.name || relationField !== $scope.selectedField.columnName) {
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
                            }
                        });
                    });
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

                publishReplaceFilterEvents(filters, function(successDatabase, successTable) {
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

                publishReplaceFilterEvents(filters, $scope.cleanFilterRowsForTable, function(errorDatabase, errorTable) {
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
                    publishReplaceFilterEvents(filters, $scope.cleanFilterRowsForTable, function(errorDatabase, errorTable) {
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
            $scope.resetFilters = function(ids) {
                XDATA.userALE.log({
                    activity: "remove",
                    action: "click",
                    elementId: "filter-builder-clear-all",
                    elementType: "button",
                    elementGroup: "query_group",
                    source: "user",
                    tags: ["filter-builder", "filter", "clear"]
                });
                var databaseAndTableNames;
                if(ids && ids.length) {
                    databaseAndTableNames = $scope.filterTable.getDatabaseAndTableNamesForKeys(ids);
                } else {
                    databaseAndTableNames = $scope.filterTable.getDatabaseAndTableNames();
                }
                if(databaseAndTableNames.length) {
                    publishRemoveFilterEvents(databaseAndTableNames, function(successDatabase, successTable) {
                        $scope.$apply(function() {
                            // Remove the visible filter list.
                            $scope.filterTable.clearFilterState(successDatabase, successTable);
                        });
                    });
                }
            };

            var publishReplaceFilterEvents = function(filters, successCallback, errorCallback) {
                var filterObject = filters.shift();
                var filter = filterObject.filter;

                if(filter.whereClause && filter.whereClause.lhs) {
                    filter.name(filterService.filterBuildPrefix + ": " + filter.whereClause.lhs + " " + filter.whereClause.operator + " " + filter.whereClause.rhs);
                } else if(filter.whereClause && filter.whereClause.whereClauses) {
                    filter.name(filterService.filterBuildPrefix + ": " + filter.tableName + " - " + filter.whereClause.whereClauses.length + " filters");
                }

                var databaseName = filterObject.databaseName;
                var tableName = filterObject.tableName;
                var filterKey = $scope.filterTable.getFilterKey(databaseName, tableName);

                if(!filter.whereClause) {
                    $scope.resetFilters([filterKey]);
                    if(filters.length) {
                        publishReplaceFilterEvents(filters, successCallback, errorCallback);
                    }
                    return;
                }

                XDATA.userALE.log({
                    activity: "alter",
                    action: "filter",
                    elementId: "filter-builder",
                    elementType: "panel",
                    elementGroup: "query_group",
                    source: "system",
                    tags: ["filter", "filter-builder"]
                });
                filterService.replaceFilterForKey($scope.messenger, filterKey, filter, function() {
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
                        publishReplaceFilterEvents(filters, successCallback, errorCallback);
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
                        publishReplaceFilterEvents(filters, successCallback, errorCallback);
                    }
                });
            };

            var publishRemoveFilterEvents = function(databaseAndTableNames, successCallback) {
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
                filterService.removeFiltersForKeys([filterKey], function() {
                    if(successCallback) {
                        successCallback(databaseAndTableName.database, databaseAndTableName.table);
                    }
                    if(databaseAndTableNames.length) {
                        publishRemoveFilterEvents(databaseAndTableNames, successCallback);
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
                        publishRemoveFilterEvents(databaseAndTableNames, successCallback);
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
                initialize();
                displayActiveDataset();
            });
        }
    };
}]);
