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
.directive('countBy', ['external', 'ConnectionService', 'DatasetService', 'ErrorNotificationService', 'FilterService',
'ExportService', '$filter', 'LinksPopupService',
function(external, connectionService, datasetService, errorNotificationService, filterService, exportService, $filter, linksPopupService) {
    return {
        templateUrl: 'partials/directives/countby.html',
        restrict: 'EA',
        scope: {
            bindTitle: '=',
            bindCountField: '=', // Deprecated - please use bind-data-field now.
            bindDataField: '=',
            bindAggregation: '=',
            bindAggregationField: '=',
            bindTable: '=',
            bindDatabase: '=',
            hideHeader: '=?',
            hideAdvancedOptions: '=?',
            limitCount: '=?'
        },

        link: function($scope, $element) {
            $element.addClass('count-by-directive');

            $scope.element = $element;

            $scope.tableId = 'countby-' + uuid();
            var tableDiv = $element.find('.count-by-table');
            tableDiv.attr("id", $scope.tableId);

            $scope.active = {};
            $scope.loadingData = false;

            //Wait for neon to be ready, the create our messenger and intialize the view and data.
            neon.ready(function() {
                $scope.init();
            });
        },

        controller: function($scope) {
            var handleRowClick = function(cell) {
                if($scope.gridOptions.api.getSelectedNodes()[0] && $scope.gridOptions.api.getSelectedNodes()[0].id === cell.rowIndex) {
                    $scope.gridOptions.api.deselectIndex(cell.rowIndex);
                } else {
                    $scope.gridOptions.api.selectIndex(cell.rowIndex, false);
                }

                setFilter($scope.active.dataField.columnName, cell.node.data[$scope.active.dataField.columnName]);
            };

            // Unique field name used for the SlickGrid column containing the URLs for the external apps.
            // This name should be one that is highly unlikely to be a column name in a real database.
            $scope.EXTERNAL_APP_FIELD_NAME = "neonExternalApps";

            $scope.gridOptions = {
                columnDefs: [],
                rowData: [],
                enableColResize: true,
                enableSorting: true,
                showToolPanel: false,
                toolPanelSuppressPivot: true,
                toolPanelSuppressValues: true,
                suppressRowClickSelection: true
            };

            var updateSize = function() {
                var headerHeight = 0;
                $scope.element.find(".header-container").each(function() {
                    headerHeight += $(this).outerHeight(true);
                });
                $("#" + $scope.tableId).height($scope.element.height() - headerHeight);
            };

            $scope.init = function() {
                $scope.messenger = new neon.eventing.Messenger();
                $scope.messenger.subscribe(datasetService.UPDATE_DATA_CHANNEL, queryForData);
                $scope.messenger.subscribe(filterService.REQUEST_REMOVE_FILTER, function(ids) {
                    if(filterService.containsKey($scope.filterKeys, ids)) {
                        $scope.clearFilter();
                    }
                });
                $scope.messenger.events({
                    filtersChanged: onFiltersChanged
                });

                $scope.exportID = exportService.register($scope.makeCountByExportObject);

                $scope.$on('$destroy', function() {
                    XDATA.userALE.log({
                        activity: "remove",
                        action: "remove",
                        elementId: "count-by",
                        elementType: "datagrid",
                        elementSub: "count-by",
                        elementGroup: "table_group",
                        source: "system",
                        tags: ["remove", "count-by"]
                    });
                    linksPopupService.deleteLinks($scope.tableId);
                    $scope.element.off("resize", updateSize);
                    $scope.element.find(".filter-container").off("resize", updateSize);
                    $scope.messenger.removeEvents();
                    if($scope.filterSet) {
                        filterService.removeFilters($scope.messenger, $scope.filterKeys);
                    }
                    exportService.unregister($scope.exportID);
                });

                $scope.element.resize(updateSize);
                $scope.element.find(".filter-container").resize(updateSize);
                updateSize();

                $scope.active = {
                    limitCount: ($scope.limitCount ? $scope.limitCount : 5000),
                    aggregation: ($scope.bindAggregation ? $scope.bindAggregation : 'count')
                };

                initializeDataset();
            };

            /**
             * Gets database and table from dataset service and sets up dataset related scope variables
             * @method initializeDataset
             * @private
             */
            var initializeDataset = function() {
                $scope.filterKeys = filterService.createFilterKeys("countby", datasetService.getDatabaseAndTableNames());
                $scope.databases = datasetService.getDatabases();

                $scope.active.database = $scope.databases[0];
                if($scope.bindDatabase) {
                    for(var i = 0; i < $scope.databases.length; ++i) {
                        if($scope.bindDatabase === $scope.databases[i].name) {
                            $scope.active.database = $scope.databases[i];
                            break;
                        }
                    }
                }

                updateTables();
            };

            var updateTables = function() {
                $scope.tables = datasetService.getTables($scope.active.database.name);

                $scope.active.table = $scope.tables[0];
                if($scope.bindTable) {
                    for(var i = 0; i < $scope.tables.length; ++i) {
                        if($scope.bindTable === $scope.tables[i].name) {
                            $scope.active.table = $scope.tables[i];
                            break;
                        }
                    }
                }

                updateFields();
            };

            var updateFields = function() {
                $scope.loadingData = true;
                var fields = datasetService.getFields($scope.active.database.name, $scope.active.table.name);
                $scope.fields = _.filter(fields, function(field) {
                    return field.columnName !== '_id';
                });

                var dataFieldName = $scope.bindDataField || $scope.bindCountField || datasetService.getMapping($scope.active.database.name, $scope.active.table.name, neonMappings.AGGREGATE) || "";
                $scope.active.dataField = _.find($scope.fields, function(field) {
                    return field.columnName === dataFieldName;
                }) || datasetService.createBlankField();
                var aggregationFieldName = $scope.bindAggregationField || "";
                $scope.active.aggregationField = _.find($scope.fields, function(field) {
                    return field.columnName === aggregationFieldName;
                }) || datasetService.createBlankField();

                if($scope.filterSet) {
                    $scope.clearFilter();
                }

                updateColumns();
            };

            var updateColumns = function() {
                var columnDefs = [];

                if(external.active) {
                    var externalAppColumn = {
                        headerName: "",
                        field: $scope.EXTERNAL_APP_FIELD_NAME,
                        suppressSizeToFit: false,
                        cellClass: 'centered',
                        width: 30
                    };

                    columnDefs.push(externalAppColumn);
                }

                columnDefs.push({
                    headerName: $scope.active.dataField.prettyName,
                    field: $scope.active.dataField.columnName,
                    suppressSizeToFit: false,
                    onCellClicked: handleRowClick
                });

                var columnName = $scope.active.aggregation;
                if($scope.active.aggregation !== 'count') {
                    columnName += ' ' + $scope.active.aggregationField.prettyName;
                }

                columnDefs.push({
                    headerName: columnName,
                    field: $scope.active.aggregation,
                    suppressSizeToFit: false,
                    onCellClicked: handleRowClick
                });

                $scope.gridOptions.api.setRowData([]);
                $scope.gridOptions.api.setColumnDefs(columnDefs);
                $scope.gridOptions.api.sizeColumnsToFit();
                queryForData();
            };

            var queryForData = function() {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                $scope.showTooMuchDataError = false;

                var connection = connectionService.getActiveConnection();

                if(!connection || !$scope.active.dataField || ($scope.active.aggregation !== "count" && !$scope.active.aggregationField.columnName)) {
                    updateData([]);
                    $scope.loadingData = false;
                    return;
                }

                var query = buildQuery();

                XDATA.userALE.log({
                    activity: "alter",
                    action: "send",
                    elementId: "count-by",
                    elementType: "canvas",
                    elementSub: "count-by",
                    elementGroup: "table_group",
                    source: "system",
                    tags: ["query", "count-by"]
                });

                if($scope.outstandingDataQuery) {
                    $scope.outstandingDataQuery.abort();
                }

                $scope.outstandingDataQuery = connection.executeQuery(query);
                $scope.outstandingDataQuery.done(function() {
                    $scope.outstandingDataQuery = undefined;
                });
                $scope.outstandingDataQuery.done(function(queryResults) {
                    XDATA.userALE.log({
                        activity: "alter",
                        action: "receive",
                        elementId: "count-by",
                        elementType: "canvas",
                        elementSub: "count-by",
                        elementGroup: "table_group",
                        source: "system",
                        tags: ["receive", "count-by"]
                    });
                    updateData(queryResults.data);
                    $scope.loadingData = false;
                    XDATA.userALE.log({
                        activity: "alter",
                        action: "render",
                        elementId: "count-by",
                        elementType: "canvas",
                        elementSub: "count-by",
                        elementGroup: "table_group",
                        source: "system",
                        tags: ["render", "count-by"]
                    });
                });
                $scope.outstandingDataQuery.fail(function(response) {
                    if(response.status === 0) {
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "canceled",
                            elementId: "count-by",
                            elementType: "canvas",
                            elementSub: "count-by",
                            elementGroup: "table_group",
                            source: "system",
                            tags: ["canceled", "count-by"]
                        });
                    } else {
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "failed",
                            elementId: "count-by",
                            elementType: "canvas",
                            elementSub: "count-by",
                            elementGroup: "table_group",
                            source: "system",
                            tags: ["failed", "count-by"]
                        });
                        updateData({
                            data: []
                        });
                        $scope.loadingData = false;
                        if(response.responseJSON) {
                            $scope.errorMessage = errorNotificationService.showErrorMessage($scope.element, response.responseJSON.error, response.responseJSON.stackTrace);
                            if(response.responseJSON.error === errorNotificationService.TOO_MUCH_DATA_ERROR) {
                                $scope.$apply(function() {
                                    $scope.showTooMuchDataError = true;
                                });
                            }
                        }
                    }
                });
            };

            /**
             * Builds a query to pull a limited set of records that match any existing filter sets.
             * @return neon.query.Query
             * @method buildQuery
             */
            var buildQuery = function() {
                var query = new neon.query.Query().selectFrom($scope.active.database.name, $scope.active.table.name).groupBy($scope.active.dataField.columnName).where($scope.active.dataField.columnName, "!=", null);

                query.ignoreFilters([$scope.filterKeys[$scope.active.database.name][$scope.active.table.name]]);

                if($scope.active.aggregation === "count") {
                    query.aggregate(neon.query.COUNT, '*', 'count');
                    query.sortBy('count', neon.query.DESCENDING);
                }
                if($scope.active.aggregation === "min") {
                    query.aggregate(neon.query.MIN, $scope.active.aggregationField.columnName, $scope.active.aggregation);
                    query.sortBy($scope.active.aggregation, neon.query.ASCENDING);
                }
                if($scope.active.aggregation === "max") {
                    query.aggregate(neon.query.MAX, $scope.active.aggregationField.columnName, $scope.active.aggregation);
                    query.sortBy($scope.active.aggregation, neon.query.DESCENDING);
                }

                if($scope.active.limitCount) {
                    query.limit($scope.active.limitCount);
                }

                return query;
            };

            var updateData = function(data) {
                if(external.active) {
                    data = addExternalLinksToColumnData(data);
                }
                $scope.active.count = data.length;
                $scope.gridOptions.api.setRowData(stripIdField(data));
            };

            var stripIdField = function(data) {
                return _.map(data, function(row) {
                    delete row._id;
                    return row;
                });
            };

            /**
             * Event handler for filter changed events issued over Neon's messaging channels.
             * @param {Object} message A Neon filter changed message.
             * @method onFiltersChanged
             * @private
             */
            var onFiltersChanged = function(message) {
                if(message.addedFilter && message.addedFilter.databaseName === $scope.active.database.name && message.addedFilter.tableName === $scope.active.table.name) {
                    XDATA.userALE.log({
                        activity: "alter",
                        action: "query",
                        elementId: "datagrid",
                        elementType: "datagrid",
                        elementSub: "datagrid",
                        elementGroup: "chart_group",
                        source: "system",
                        tags: ["filter-change", "datagrid"]
                    });
                    queryForData();
                }
            };

            /**
             * Creates and returns an object that contains information needed to export the data in this widget.
             * @return {Object} An object containing all the information needed to export the data in this widget.
             */
            $scope.makeCountByExportObject = function() {
                XDATA.userALE.log({
                    activity: "perform",
                    action: "click",
                    elementId: "count-by-export",
                    elementType: "button",
                    elementGroup: "table_group",
                    source: "user",
                    tags: ["options", "count-by", "export"]
                });
                var query = buildQuery();
                query.limitClause = exportService.getLimitClause();
                var finalObject = {
                    name: "Count_By",
                    data: [{
                        query: query,
                        name: "countBy-" + $scope.exportID,
                        fields: [],
                        ignoreFilters: query.ignoreFilters_,
                        selectionOnly: query.selectionOnly_,
                        ignoredFilterIds: query.ignoredFilterIds_,
                        type: "query"
                    }]
                };
                finalObject.data[0].fields.push({
                    query: (query.groupByClauses[0]).field,
                    pretty: (query.groupByClauses[0]).field
                });
                var op = '';
                if($scope.active.aggregation === 'min') {
                    op = 'Min of ';
                } else if($scope.active.aggregation === 'max') {
                    op = 'Max of ';
                }
                finalObject.data[0].fields.push({
                    query: (query.aggregates[0]).name,
                    pretty: op + (query.aggregates[0]).name
                });
                return finalObject;
            };

            /**
             * Saves the given field and value as the current filter for the
             * dashboard and this widget.
             * @param {String} The filter field
             * @param {String} The filter value
             * @method setFilter
             * @private
             */
            var setFilter = function(field, value) {
                if(!$scope.filterSet || $scope.filterSet.key !== field || $scope.filterSet.value !== value) {
                    $scope.filterSet = {
                        key: field,
                        value: value
                    };

                    var connection = connectionService.getActiveConnection();
                    if($scope.messenger && connection) {
                        var relations = datasetService.getRelations($scope.active.database.name, $scope.active.table.name, [field]);
                        XDATA.userALE.log({
                            activity: "select",
                            action: "click",
                            elementId: "count-by",
                            elementType: "datagrid",
                            elementSub: "row",
                            elementGroup: "table_group",
                            source: "user",
                            tags: ["filter", "count-by"]
                        });
                        filterService.replaceFilters($scope.messenger, relations, $scope.filterKeys, createFilterClauseForCount, {
                            visName: "Aggregation Table",
                            text: $scope.active.dataField.columnName + " = " + $scope.filterSet.value
                        });
                    }
                } else if($scope.filterSet.key === field && $scope.filterSet.value === value) {
                    $scope.clearFilter();
                }
            };

            /**
             * Creates and returns a filter on the given field using the value set by this visualization.
             * @param {Object} databaseAndTableName Contains the database and table name
             * @param {String} fieldName The name of the field on which to filter
             * @method createFilterClauseForCount
             * @private
             * @return {Object} A neon.query.Filter object
             */
            var createFilterClauseForCount = function(databaseAndTableName, fieldName) {
                return neon.query.where(fieldName, '=', $scope.filterSet.value);
            };

            /**
             * Removes the current filter from the dashboard and this widget.
             */
            $scope.clearFilter = function() {
                if($scope.messenger) {
                    XDATA.userALE.log({
                        activity: "deselect",
                        action: "click",
                        elementId: "count-by",
                        elementType: "button",
                        elementGroup: "table_group",
                        source: "user",
                        tags: ["filter", "count-by"]
                    });

                    filterService.removeFilters($scope.messenger, $scope.filterKeys, function() {
                        $scope.gridOptions.api.deselectAll();
                        $scope.filterSet = undefined;
                    });
                }
            };

            /**
             * Creates and adds the external links to the given data and returns the data.
             * @param {Array} data
             * @method addExternalLinksToColumnData
             * @private
             * @return {Array}
             */
            var addExternalLinksToColumnData = function(data) {
                var tableLinks = {};
                var mappings = datasetService.getMappings($scope.active.database.name, $scope.active.table.name);

                data.forEach(function(row) {
                    var value = row[$scope.active.dataField.columnName];
                    var key = linksPopupService.generateKey($scope.active.dataField, value);
                    tableLinks[key] = linksPopupService.createAllServiceLinkObjects(external.services, mappings, $scope.active.dataField.columnName, value);
                    row[$scope.EXTERNAL_APP_FIELD_NAME] = tableLinks[key].length ? linksPopupService.createLinkHtml($scope.tableId, key, value) : linksPopupService.createDisabledLinkHtml(value);
                });

                // Set the link data for the links popup for this visualization.
                linksPopupService.setLinks($scope.tableId, tableLinks);

                return data;
            };

            var logChange = function(element, value) {
                XDATA.userALE.log({
                    activity: "select",
                    action: "click",
                    elementId: "count-by",
                    elementType: "combobox",
                    elementSub: element,
                    elementGroup: "table_group",
                    source: "user",
                    tags: ["options", "count-by", value]
                });
            };

            $scope.handleDatabaseChange = function() {
                logChange("database", $scope.active.database.name);
                updateTables();
            };

            $scope.handleTableChange = function() {
                logChange("table", $scope.active.table.name);
                updateFields();
            };

            $scope.handleDataFieldChange = function() {
                logChange("data-field", $scope.active.dataField.columnName);
                if(!$scope.loadingData) {
                    updateColumns();
                }
            };

            $scope.handleAggregationChange = function() {
                logChange("aggregation", $scope.active.aggregation);
                if(!$scope.loadingData) {
                    updateColumns();
                }
            };

            $scope.handleAggregationFieldChange = function() {
                logChange("aggregation-field", $scope.active.aggregationField.columnName);
                if(!$scope.loadingData) {
                    updateColumns();
                }
            };

            $scope.handleLimitChange = function() {
                logChange("limit", $scope.active.limitCount);
                if(!$scope.loadingData) {
                    updateColumns();
                }
            };

            $scope.generateTitle = function() {
                var title = $scope.active.filterValue ? $scope.active.filterValue + " " : "";
                if($scope.bindTitle) {
                    return title + $scope.bindTitle;
                }
                return title + $scope.active.table.prettyName + ($scope.active.dataField.prettyName ? " / " + $scope.active.dataField.prettyName : "");
            };
        }
    };
}]);
