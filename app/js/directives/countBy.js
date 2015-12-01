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
.directive('countBy', ['external', 'popups', 'ConnectionService', 'DatasetService', 'ErrorNotificationService', 'FilterService', 'ExportService', '$filter',
function(external, popups, connectionService, datasetService, errorNotificationService, filterService, exportService, $filter) {
    return {
        templateUrl: 'partials/directives/countby.html',
        restrict: 'EA',
        scope: {
            bindTitle: '=',
            bindCountField: '=',
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

            //Wait for neon to be ready, the create our messenger and intialize the view and data.
            neon.ready(function() {
                $scope.init();
            });
        },
        controller: function($scope) {
            var handleRowClick = function(row) {
                setFilter($scope.active.field.columnName, row.node.data[$scope.active.field.columnName]);
            };

            $scope.gridOptions = {
                columnDefs: [],
                rowData: [],
                enableColResize: true,
                enableSorting: true,
                showToolPanel: false,
                toolPanelSuppressPivot: true,
                toolPanelSuppressValues: true,
                rowSelection: 'single',
                onRowSelected: handleRowClick
            };

            $scope.init = function() {
                $scope.filterKeys = filterService.createFilterKeys("countby", datasetService.getDatabaseAndTableNames());

                $scope.messenger = new neon.eventing.Messenger();

                $scope.messenger.subscribe(datasetService.UPDATE_DATA_CHANNEL, $scope.queryForData);
                $scope.messenger.subscribe(filterService.REQUEST_REMOVE_FILTER, function(ids) {
                    if(filterService.containsKey($scope.filterKeys, ids)) {
                        $scope.clearFilter();
                    }
                });
                $scope.messenger.events({
                    filtersChanged: onFiltersChanged
                });

                initializeDataset();
                updateFields();

                $scope.active.limitCount = ($scope.limitCount ? $scope.limitCount : 5000);
                $scope.active.aggregation = ($scope.bindAggregation ? $scope.bindAggregation : 'count');

                updateColumns();

                $scope.queryForData();
            };

            var initializeDataset = function() {
                $scope.databases = datasetService.getDatabases();
                $scope.active = {
                    database: $scope.databases[0]
                };
                $scope.tables = datasetService.getTables($scope.active.database.name);
                $scope.active.table = $scope.tables[0];
            };

            var updateFields = function() {
                $scope.fields = getFields();

                $scope.active.sortByField = $scope.fields[0];
                $scope.active.sortDirection = neon.query.ASCENDING;

                $scope.active.field = ($scope.bindAggregationField ? $scope.bindAggregationField : $scope.fields[0]);
            };

            var updateColumns = function() {
                var columnDefs = [];

                columnDefs.push({
                    headerName: $scope.active.field.prettyName,
                    field: $scope.active.field.columnName,
                    suppressSizeToFit: false
                });

                var columnName = $scope.active.aggregation;
                if($scope.active.aggregation !== 'count') {
                    columnName += ' ' + $scope.active.aggregationField.prettyName;
                }

                columnDefs.push({
                    headerName: columnName,
                    field: $scope.active.aggregation,
                    suppressSizeToFit: false
                });

                $scope.gridOptions.api.setColumnDefs(columnDefs);

                updateColumnSizes();
            };

            var getFields = function() {
                var fields = datasetService.getFields($scope.active.database.name, $scope.active.table.name);
                return _.filter(fields, function(field) {
                    console.log(field);
                    return field.columnName !== '_id';
                });
            };

            var updateColumnSizes = function() {
                $scope.gridOptions.api.sizeColumnsToFit();
            };

            $scope.queryForData = function() {
                var connection = connectionService.getActiveConnection();

                if(!connection) {
                    updateData([]);
                    return;
                }

                var query = buildQuery();

                if($scope.outstandingDataQuery) {
                    $scope.outstandingDataQuery.abort();
                }

                $scope.outstandingDataQuery = connection.executeQuery(query);
                $scope.outstandingDataQuery.done(function() {
                    $scope.outstandingDataQuery = undefined;
                });
                $scope.outstandingDataQuery.done(function(queryResults) {
                    updateData(queryResults.data);
                });
                $scope.outstandingDataQuery.fail(function(response) {
                    updateData([]);
                });
            };

            /**
             * Builds a query to pull a limited set of records that match any existing filter sets.
             * @return neon.query.Query
             * @method buildQuery
             */
            var buildQuery = function() {
                var query = new neon.query.Query().selectFrom($scope.active.database.name, $scope.active.table.name).groupBy($scope.active.field.columnName).where($scope.active.field.columnName, "!=", null);

                // The widget displays its own ignored rows with 0.5 opacity.
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
                    $scope.queryForData();
                }
            };

            $scope.updateAggregation = function() {
                updateColumns();
                $scope.queryForData();
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
                            text: $scope.active.field.columnName + " = " + $scope.filterSet.value
                        });
                    }
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
                        //deselect row
                        $scope.filterSet = undefined;
                    });
                }
            };
        }

    //             $scope.outstandingQuery.fail(function(response) {
    //                 if(response.status === 0) {
    //                     XDATA.userALE.log({
    //                         activity: "alter",
    //                         action: "canceled",
    //                         elementId: "count-by",
    //                         elementType: "canvas",
    //                         elementSub: "count-by",
    //                         elementGroup: "table_group",
    //                         source: "system",
    //                         tags: ["canceled", "count-by"]
    //                     });
    //                 } else {
    //                     XDATA.userALE.log({
    //                         activity: "alter",
    //                         action: "failed",
    //                         elementId: "count-by",
    //                         elementType: "canvas",
    //                         elementSub: "count-by",
    //                         elementGroup: "table_group",
    //                         source: "system",
    //                         tags: ["failed", "count-by"]
    //                     });
    //                     $scope.updateData({
    //                         data: []
    //                     });
    //                     $scope.loadingData = false;
    //                     if(response.responseJSON) {
    //                         $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
    //                         if(response.responseJSON.error === errorNotificationService.TOO_MUCH_DATA_ERROR) {
    //                             $scope.$apply(function() {
    //                                 $scope.showTooMuchDataError = true;
    //                             });
    //                         }
    //                     }
    //                 }
    //             });
    //         };









    //         // Unique field name used for the SlickGrid column containing the URLs for the external apps.
    //         // This name should be one that is highly unlikely to be a column name in a real database.
    //         $scope.EXTERNAL_APP_FIELD_NAME = "neonExternalApps";

    //         $scope.addExternalAppUrlColumnData = function(data) {
    //             var tableLinks = [];

    //             data.data.forEach(function(row) {
    //                 var field = $scope.options.field.columnName;
    //                 var value = row[$scope.options.field.columnName];
    //                 var query = field + "=" + value;

    //                 var links = [];

    //                 if(external.dig.enabled) {
    //                     links.push($scope.createLinkObject(external.dig, field, value, query));
    //                 }

    //                 var linksIndex = tableLinks.length;
    //                 tableLinks.push(links);

    //                 row[$scope.EXTERNAL_APP_FIELD_NAME] = "<a data-toggle=\"modal\" data-target=\".links-popup\" data-links-index=\"" + linksIndex +
    //                     "\" data-links-source=\"" + $scope.tableId + "\" class=\"collapsed dropdown-toggle primary neon-popup-button\">" +
    //                     "<span class=\"glyphicon glyphicon-link\"></span></a>";
    //             });

    //             // Set the link data for the links popup for this visualization.
    //             popups.links.setData($scope.tableId, tableLinks);

    //             return data;
    //         };
    };
}]);