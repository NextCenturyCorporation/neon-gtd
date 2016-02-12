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
'ExportService', 'LinksPopupService', 'ThemeService', 'VisualizationService',
function(external, connectionService, datasetService, errorNotificationService, filterService,
exportService, linksPopupService, themeService, visualizationService) {
    return {
        templateUrl: 'components/aggregationTable/aggregationTable.html',
        restrict: 'EA',
        scope: {
            bindTitle: '=',
            bindCountField: '=', // Deprecated
            bindGroupField: '=',
            bindAggregation: '=',
            bindAggregationField: '=',
            bindLimit: '=',
            bindFilterField: '=',
            bindFilterValue: '=',
            bindTable: '=',
            bindDatabase: '=',
            bindStateId: '=',
            hideHeader: '=?',
            hideAdvancedOptions: '=?'
        },

        link: function($scope, $element) {
            $element.addClass('count-by-directive');

            $scope.element = $element;

            $scope.tableId = 'countby-' + uuid();
            var tableDiv = $element.find('.count-by-table');
            tableDiv.attr("id", $scope.tableId);

            $scope.active = {
                database: {},
                table: {},
                dataField: {},
                aggregationField: {},
                filterField: {}
            };

            //Wait for neon to be ready, the create our messenger and intialize the view and data.
            neon.ready(function() {
                $scope.init();
            });
        },

        controller: ["$scope", function($scope) {
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

            $scope.optionsMenuButtonText = function() {
                if($scope.showTooMuchDataError) {
                    return "Error";
                }
                return ($scope.active.count >= $scope.active.limit ? "Limited to " : "") + ($scope.active.count || "No") + " Groups";
            };
            $scope.showOptionsMenuButtonText = function() {
                return true;
            };

            var resizeTitle = function() {
                // Set the width of the title to the width of the visualization minus the width of the chart options button/text and padding.
                var titleWidth = $scope.element.width() - $scope.element.find(".chart-options").outerWidth(true) - 20;
                // Also subtract the width of the table options button.
                titleWidth -= ($scope.element.find(".edit-table-icon").outerWidth(true) + 10);
                $scope.element.find(".title").css("maxWidth", titleWidth);
            };

            var resizeTable = function() {
                var headerHeight = 0;
                $scope.element.find(".header-container").each(function() {
                    headerHeight += $(this).outerHeight(true);
                });
                $("#" + $scope.tableId).height($scope.element.height() - headerHeight);
            };

            var resize = function() {
                resizeTitle();
                resizeTable();
            };

            $scope.init = function() {
                $scope.messenger = new neon.eventing.Messenger();
                $scope.messenger.subscribe(datasetService.UPDATE_DATA_CHANNEL, queryForData);
                $scope.messenger.events({
                    filtersChanged: onFiltersChanged
                });

                $scope.exportID = exportService.register($scope.makeCountByExportObject);
                visualizationService.register($scope.bindStateId, bindFields);

                themeService.registerListener($scope.tableId, onThemeChanged);

                $scope.$on('$destroy', function() {
                    XDATA.userALE.log({
                        activity: "remove",
                        action: "remove",
                        elementId: "aggregation-table",
                        elementType: "datagrid",
                        elementSub: "aggregation-table",
                        elementGroup: "table_group",
                        source: "system",
                        tags: ["remove", "aggregation-table"]
                    });
                    linksPopupService.deleteLinks($scope.tableId);
                    $scope.element.off("resize", resize);
                    $scope.element.find(".filter-container").off("resize", resizeTable);
                    $scope.messenger.unsubscribeAll();
                    if($scope.filterSet) {
                        filterService.removeFilter($scope.active.database.name, $scope.active.table.name, [$scope.active.dataField.columnName]);
                    }
                    exportService.unregister($scope.exportID);
                    visualizationService.unregister($scope.bindStateId);
                    themeService.unregisterListener($scope.tableId);
                });

                $scope.element.resize(resize);
                $scope.element.find(".filter-container").resize(resizeTable);
                resize();

                $scope.active = {
                    limit: $scope.bindLimit || 5000,
                    aggregation: $scope.bindAggregation || 'count'
                };

                initializeDataset();
            };

            /**
             * Gets database and table from dataset service and sets up dataset related scope variables
             * @method initializeDataset
             * @private
             */
            var initializeDataset = function() {
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

                updateTables(function() {
                    if($scope.active.database && $scope.active.database.name && $scope.active.table && $scope.active.table.name) {
                        updateFilterSet();
                    }
                    queryForData();
                });
            };

            var updateTables = function(callback) {
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

                updateFields(callback);
            };

            var updateFields = function(callback) {
                // Stops extra data queries that may be caused by event handlers triggered by setting the active fields.
                $scope.initializing = true;

                var fields = datasetService.getSortedFields($scope.active.database.name, $scope.active.table.name);
                $scope.fields = _.filter(fields, function(field) {
                    return field.columnName !== '_id';
                });

                var dataFieldName = $scope.bindGroupField || $scope.bindCountField || datasetService.getMapping($scope.active.database.name, $scope.active.table.name, neonMappings.AGGREGATE) || "";
                $scope.active.dataField = _.find($scope.fields, function(field) {
                    return field.columnName === dataFieldName;
                }) || datasetService.createBlankField();
                var aggregationFieldName = $scope.bindAggregationField || "";
                $scope.active.aggregationField = _.find($scope.fields, function(field) {
                    return field.columnName === aggregationFieldName;
                }) || datasetService.createBlankField();
                var filterFieldName = $scope.bindFilterField || "";
                $scope.active.filterField = _.find($scope.fields, function(field) {
                    return field.columnName === filterFieldName;
                }) || datasetService.createBlankField();
                $scope.active.filterValue = $scope.bindFilterValue || "";

                if($scope.filterSet) {
                    $scope.clearFilter();
                }

                updateColumns(callback);
            };

            var updateColumns = function(callback) {
                var columnDefinitions = [];

                if(external.active) {
                    var externalAppColumn = {
                        headerName: "",
                        field: $scope.EXTERNAL_APP_FIELD_NAME,
                        suppressSizeToFit: false,
                        cellClass: 'centered',
                        width: 30
                    };

                    columnDefinitions.push(externalAppColumn);
                }

                columnDefinitions.push({
                    headerName: $scope.active.dataField.prettyName,
                    field: $scope.active.dataField.columnName,
                    suppressSizeToFit: false,
                    onCellClicked: handleRowClick
                });

                var columnName = $scope.active.aggregation;
                if($scope.active.aggregation !== 'count') {
                    columnName += ' ' + $scope.active.aggregationField.prettyName;
                }

                columnDefinitions.push({
                    headerName: columnName,
                    field: $scope.active.aggregation,
                    suppressSizeToFit: false,
                    onCellClicked: handleRowClick
                });

                $scope.gridOptions.api.setColumnDefs(columnDefinitions);
                $scope.gridOptions.api.sizeColumnsToFit();

                if(callback) {
                    callback();
                    return;
                }

                queryForData();
            };

            var queryForData = function() {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                $scope.showTooMuchDataError = false;

                // Save the title during the query so the title doesn't change immediately if the user changes the unshared filter.
                $scope.queryTitle = $scope.generateTitle(true);

                resizeTitle();

                var connection = connectionService.getActiveConnection();

                if(!connection || !$scope.active.dataField.columnName || ($scope.active.aggregation !== "count" && !$scope.active.aggregationField.columnName)) {
                    updateData([]);
                    $scope.initializing = false;
                    return;
                }

                $scope.gridOptions.api.setRowData([]);

                var query = buildQuery();

                XDATA.userALE.log({
                    activity: "alter",
                    action: "send",
                    elementId: "aggregation-table",
                    elementType: "canvas",
                    elementSub: "aggregation-table",
                    elementGroup: "table_group",
                    source: "system",
                    tags: ["query", "aggregation-table"]
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
                        elementId: "aggregation-table",
                        elementType: "canvas",
                        elementSub: "aggregation-table",
                        elementGroup: "table_group",
                        source: "system",
                        tags: ["receive", "aggregation-table"]
                    });
                    updateData(queryResults.data);
                    $scope.initializing = false;
                    XDATA.userALE.log({
                        activity: "alter",
                        action: "render",
                        elementId: "aggregation-table",
                        elementType: "canvas",
                        elementSub: "aggregation-table",
                        elementGroup: "table_group",
                        source: "system",
                        tags: ["render", "aggregation-table"]
                    });
                });
                $scope.outstandingDataQuery.fail(function(response) {
                    if(response.status === 0) {
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "canceled",
                            elementId: "aggregation-table",
                            elementType: "canvas",
                            elementSub: "aggregation-table",
                            elementGroup: "table_group",
                            source: "system",
                            tags: ["canceled", "aggregation-table"]
                        });
                    } else {
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "failed",
                            elementId: "aggregation-table",
                            elementType: "canvas",
                            elementSub: "aggregation-table",
                            elementGroup: "table_group",
                            source: "system",
                            tags: ["failed", "aggregation-table"]
                        });
                        updateData([]);
                        $scope.initializing = false;
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
                var whereNotNull = neon.query.where($scope.active.dataField.columnName, "!=", null);
                var query = new neon.query.Query().selectFrom($scope.active.database.name, $scope.active.table.name).groupBy($scope.active.dataField.columnName).where(whereNotNull);

                if($scope.filterSet && $scope.filterSet.key && $scope.filterSet.value) {
                    var filterClause = createFilterClauseForCount({
                                database: $scope.active.database.name,
                                table: $scope.active.table.name
                            }, $scope.active.dataField.columnName);
                    query.ignoreFilters([filterService.getFilterKey($scope.active.database.name, $scope.active.table.name, filterClause)]);
                }

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

                if($scope.active.limit) {
                    query.limit($scope.active.limit);
                }

                if(datasetService.isFieldValid($scope.active.filterField) && $scope.active.filterValue) {
                    var operator = "contains";
                    var value = $scope.active.filterValue;
                    if($.isNumeric(value)) {
                        operator = "=";
                        value = parseFloat(value);
                    }
                    query.where(neon.query.and(whereNotNull, neon.query.where($scope.active.filterField.columnName, operator, value)));
                }

                return query;
            };

            var updateData = function(data) {
                if(external.active) {
                    data = addExternalLinksToColumnData(data);
                }
                $scope.active.count = data.length;
                $scope.gridOptions.api.setRowData(stripIdField(data));

                if($scope.filterSet && $scope.filterSet.key && $scope.filterSet.value) {
                    var selectedNode = _.findWhere($scope.gridOptions.api.getRenderedNodes(), function(node) {
                        return node.data[$scope.filterSet.key] === $scope.filterSet.value;
                    });
                    $scope.gridOptions.api.selectNode(selectedNode);
                }
            };

            var stripIdField = function(data) {
                return _.map(data, function(row) {
                    delete row._id;
                    return row;
                });
            };

            /*
             * Updates the filter set with any matching filters found.
             * @method updateFilterSet
             * @private
             */
            var updateFilterSet = function() {
                if(datasetService.isFieldValid($scope.active.dataField)) {
                    var filter = filterService.getFilter($scope.active.database.name, $scope.active.table.name, [$scope.active.dataField.columnName]);

                    if(filter && filterService.hasSingleClause(filter)) {
                        $scope.filterSet = {
                            key: filter.filter.whereClause.lhs,
                            value: filter.filter.whereClause.rhs,
                            database: filter.filter.databaseName,
                            table: filter.filter.tableName
                        };
                    } else if(!filter && $scope.filterSet) {
                        $scope.gridOptions.api.deselectAll();
                        $scope.filterSet = undefined;
                    }
                }
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

                    updateFilterSet();
                    queryForData();
                }
            };

            var onThemeChanged = function(theme) {
                $scope.themeType = theme.type;
            };

            /**
             * Creates and returns an object that contains information needed to export the data in this widget.
             * @return {Object} An object containing all the information needed to export the data in this widget.
             */
            $scope.makeCountByExportObject = function() {
                XDATA.userALE.log({
                    activity: "perform",
                    action: "click",
                    elementId: "aggregation-table-export",
                    elementType: "button",
                    elementGroup: "table_group",
                    source: "user",
                    tags: ["options", "aggregation-table", "export"]
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
                        value: value,
                        database: $scope.active.database.name,
                        table: $scope.active.table.name
                    };

                    var connection = connectionService.getActiveConnection();
                    if($scope.messenger && connection) {
                        XDATA.userALE.log({
                            activity: "select",
                            action: "click",
                            elementId: "aggregation-table",
                            elementType: "datagrid",
                            elementSub: "row",
                            elementGroup: "table_group",
                            source: "user",
                            tags: ["filter", "aggregation-table"]
                        });
                        filterService.addFilter($scope.messenger, $scope.active.database.name, $scope.active.table.name, [field],
                            createFilterClauseForCount, {
                                visName: "Aggregation Table",
                                text: $scope.active.dataField.columnName + " = " + $scope.filterSet.value
                            }
                        );
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
                if($scope.filterSet && $scope.filterSet.key && $scope.filterSet.value) {
                    XDATA.userALE.log({
                        activity: "deselect",
                        action: "click",
                        elementId: "aggregation-table",
                        elementType: "button",
                        elementGroup: "table_group",
                        source: "user",
                        tags: ["filter", "aggregation-table"]
                    });

                    filterService.removeFilter($scope.filterSet.database, $scope.filterSet.table,
                        [$scope.filterSet.key], function() {
                            $scope.gridOptions.api.deselectAll();
                            $scope.filterSet = undefined;
                        }
                    );
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

            var logChange = function(element, value, type) {
                XDATA.userALE.log({
                    activity: "select",
                    action: "click",
                    elementId: "aggregation-table",
                    elementType: type || "combobox",
                    elementSub: element,
                    elementGroup: "table_group",
                    source: "user",
                    tags: ["options", "aggregation-table", value]
                });
            };

            $scope.handleChangeDatabase = function() {
                logChange("database", $scope.active.database.name);
                updateTables();
            };

            $scope.handleChangeTable = function() {
                logChange("table", $scope.active.table.name);
                updateFields();
            };

            $scope.handleChangeDataField = function() {
                logChange("data-field", $scope.active.dataField.columnName);
                if(!$scope.initializing) {
                    updateColumns();
                }
            };

            $scope.handleChangeAggregation = function() {
                logChange("aggregation", $scope.active.aggregation);
                if(!$scope.initializing) {
                    updateColumns();
                }
            };

            $scope.handleChangeAggregationField = function() {
                logChange("aggregation-field", $scope.active.aggregationField.columnName);
                if(!$scope.initializing) {
                    updateColumns();
                }
            };

            $scope.handleChangeLimit = function() {
                logChange("limit", $scope.active.limit, "button");
                if(!$scope.initializing) {
                    queryForData();
                }
            };

            $scope.handleChangeUnsharedFilterField = function() {
                logChange("unshared-filter-field", $scope.active.filterField.columnName);
                $scope.active.filterValue = "";
            };

            $scope.handleChangeUnsharedFilterValue = function() {
                logChange("unshared-filter-value", $scope.active.filterValue);
                if(!$scope.initializing) {
                    queryForData();
                }
            };

            $scope.handleRemoveUnsharedFilter = function() {
                logChange("unshared-filter", "");
                $scope.active.filterValue = "";
                if(!$scope.initializing) {
                    queryForData();
                }
            };

            /**
             * Creates and returns an object that contains all the binding fields needed to recreate the visualization's state.
             * @return {Object}
             * @method bindFields
             * @private
             */
            var bindFields = function() {
                var bindingFields = {};

                bindingFields["bind-title"] = "'" + $scope.generateTitle() + "'";
                bindingFields["bind-group-field"] = ($scope.active.dataField && $scope.active.dataField.columnName) ? "'" + $scope.active.dataField.columnName + "'" : undefined;
                bindingFields["bind-aggregation"] = $scope.active.aggregation ? "'" + $scope.active.aggregation + "'" : undefined;
                var hasAggField = $scope.active.aggregation && $scope.active.aggregation !== 'count' && $scope.active.aggregationField && $scope.active.aggregationField.columnName;
                bindingFields["bind-aggregation-field"] = hasAggField ? "'" + $scope.active.aggregationField.columnName + "'" : undefined;
                bindingFields["bind-table"] = ($scope.active.table && $scope.active.table.name) ? "'" + $scope.active.table.name + "'" : undefined;
                bindingFields["bind-database"] = ($scope.active.database && $scope.active.database.name) ? "'" + $scope.active.database.name + "'" : undefined;
                bindingFields["bind-limit"] = $scope.active.limitCount;
                bindingFields["bind-filter-field"] = ($scope.active.filterField && $scope.active.filterField.columnName) ? "'" + $scope.active.filterField.columnName + "'" : undefined;
                var hasFilterValue = $scope.active.filterField && $scope.active.filterField.columnName && $scope.active.filterValue;
                bindingFields["bind-filter-value"] = hasFilterValue ? "'" + $scope.active.filterValue + "'" : undefined;

                return bindingFields;
            };

            /**
             * Generates and returns the title for this visualization.
             * @param {Boolean} resetQueryTitle
             * @method generateTitle
             * @return {String}
             */
            $scope.generateTitle = function(resetQueryTitle) {
                if(resetQueryTitle) {
                    $scope.queryTitle = "";
                }
                if($scope.queryTitle) {
                    return $scope.queryTitle;
                }
                var title = $scope.active.filterValue ? $scope.active.filterValue + " " : "";
                if($scope.bindTitle) {
                    return title + $scope.bindTitle;
                }
                if(_.keys($scope.active).length) {
                    return title + $scope.active.table.prettyName + ($scope.active.dataField.prettyName ? " / " + $scope.active.dataField.prettyName : "");
                }
                return title;
            };
        }]
    };
}]);
