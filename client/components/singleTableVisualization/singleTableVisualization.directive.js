'use strict';

/*
 * Copyright 2016 Next Century Corporation
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

angular.module('neonDemo.directives').directive('singleTableVisualization',
['external', 'ConnectionService', 'DatasetService', 'ErrorNotificationService', 'FilterService', 'ExportService', 'LinksPopupService', 'ThemeService', 'TranslationService', 'VisualizationService',
function(external, connectionService, datasetService, errorNotificationService, filterService, exportService, linksPopupService, themeService, translationService, visualizationService) {
    return {
        templateUrl: 'components/singleTableVisualization/singleTableVisualization.html',
        restrict: 'EA',
        scope: {
            bindings: '=',
            logElementGroup: '@?',
            logElementType: '@?',
            name: '@',
            stateId: '@',
            type: '@',
            visualizationId: '@'
        },

        compile: function($element, $attrs) {
            // Must add angular attributes, controllers, and templates here before angular compiles the HTML for this directive.
            $element.find(".visualization").attr("visualization-id", $attrs.visualizationId);
            $element.find(".visualization").attr("ng-controller", $attrs.type + "Controller");
            $element.find(".visualization-display").attr("ng-include", "'components/" + $attrs.type + "/" + $attrs.type + "Display.html'");
            $element.find(".visualization-headers").attr("ng-include", "'components/" + $attrs.type + "/" + $attrs.type + "Headers.html'");
            $element.find(".visualization-options").attr("ng-include", "'components/" + $attrs.type + "/" + $attrs.type + "Options.html'");

            // Returns the angular directive link function.
            return function($scope, $element) {
                $scope.element = $element;
            }
        },

        controller: ["$scope", function($scope) {
            $scope.logElementGroup = $scope.logElementGroup || "chart_group";
            $scope.logElementType = $scope.logElementType || "canvas";

            $scope.active = {
                database: {},
                table: {},
                unsharedFilterField: {}
            };

            $scope.filter = {
                data: []
            };

            $scope.functions = {};

            $scope.languages = {
                fromLanguageOptions: {},
                toLanguageOptions: {},
                chosenFromLanguage: "",
                chosenToLanguage: ""
            };

            /**
             * Initializes this visualization.
             * @method init
             */
            $scope.init = function() {
                $scope.messenger = new neon.eventing.Messenger();
                $scope.messenger.subscribe(datasetService.UPDATE_DATA_CHANNEL, queryAndUpdate);
                $scope.messenger.events({
                    filtersChanged: handleFiltersChangedEvent
                });

                $scope.exportId = exportService.register($scope.makeExportObject);
                themeService.registerListener($scope.visualizationId, handleThemeChangedEvent);
                visualizationService.register($scope.stateId, getBindingFields);

                if($scope.functions.allowTranslation() && translationService.hasKey()) {
                    $scope.translationsOn = true;
                    translationService.getSupportedLanguages(function(languages) {
                        $scope.languages.fromLanguageOptions = languages;
                        $scope.languages.toLanguageOptions = languages;
                    }, function(response) {
                        if($scope.errorMessage) {
                            errorNotificationService.hideErrorMessage($scope.errorMessage);
                            $scope.errorMessage = undefined;
                        }
                        $scope.errorMessage = errorNotificationService.showErrorMessage($scope.element, response.message,  response.reason);
                    });
                }

                $scope.$on('$destroy', function() {
                    XDATA.userALE.log({
                        activity: "remove",
                        action: "remove",
                        elementId: $scope.type,
                        elementType: $scope.logElementType,
                        elementSub: $scope.type,
                        elementGroup: $scope.logElementGroup,
                        source: "system",
                        tags: ["remove", $scope.type]
                    });

                    $scope.element.off("resize", resize);
                    $scope.element.find(".filter-container").off("resize", resizeDisplay);
                    $scope.element.find(".chart-options-button").off("resize", resizeTitle);
                    $scope.messenger.unsubscribeAll();

                    if($scope.functions.isFilterSet()) {
                        removeAllFilters(true);
                    }

                    exportService.unregister($scope.exportId);
                    linksPopupService.deleteLinks($scope.visualizationId);
                    themeService.unregisterListener($scope.visualizationId);
                    visualizationService.unregister($scope.stateId);

                    $scope.functions.onDestroy();
                });

                $scope.element.resize(resize);
                $scope.element.find(".filter-container").resize(resizeDisplay);
                $scope.element.find(".chart-options-button").resize(resizeTitle);
                resize();

                $scope.functions.onInit();

                updateDatabases();
            };

            /**
             * Returns whether this visualization allows translation of its data.
             * @method allowTranslation
             * @return {Boolean}
             */
            $scope.functions.allowTranslation = function() {
                return false;
            };

            /**
             * Resizes the title and the display of this visualization.
             * @method resize
             * @private
             */
            var resize = function() {
                resizeTitle();
                resizeDisplay();
            };

            /**
             * Resizes the title of this visualization.
             * @method resizeTitle
             * @private
             */
            var resizeTitle = function() {
                // Set the width of the title to the width of this visualization minus the width of the options button/text, padding, and any other elements in the title header.
                var titleWidth = $scope.element.width() - $scope.element.find(".chart-options").outerWidth(true) - 10;
                $scope.element.find(".title").css("maxWidth", titleWidth);
            };

            /**
             * Resizes the display of this visualization.
             * @method resizeDisplay
             * @private
             */
            var resizeDisplay = function() {
                var headerHeight = 0;
                $scope.element.find(".header-container").each(function() {
                    headerHeight += $(this).outerHeight(true);
                });
                $("#" + $scope.visualizationId).height($scope.element.height() - headerHeight);
                $scope.functions.onResize();
            };

            /**
             * Returns whether a filter is set in this visualization.
             * @method isFilterSet
             * @return {Boolean}
             */
            $scope.functions.isFilterSet = function() {
                return isFilterSet();
            };

            var isFilterSet = function() {
                return $scope.filter.data.length;
            };

            /**
             * Handles the behavior for destroying this visualization.
             * @method onDestroy
             */
            $scope.functions.onDestroy = function() {
                // Do nothing.
            };

            /**
             * Handles the behavior for initializing this visualization.
             * @method onInit
             */
            $scope.functions.onInit = function() {
                // Do nothing.
            };

            /**
             * Handles the behavior for resizing this visualization.
             * @method onResize
             */
            $scope.functions.onResize = function() {
                // Do nothing.
            };

            /**
             * Gets the list of databases from the dataset service, sets the active database, table, and fields, and queries for new data.
             * @method updateDatabases
             * @private
             */
            var updateDatabases = function() {
                $scope.databases = datasetService.getDatabases();
                $scope.active.database = $scope.databases[0];
                if($scope.bindings.database) {
                    $scope.databases.forEach(function(database) {
                        if($scope.bindings.database === database.name) {
                            $scope.active.database = database;
                        }
                    });
                }

                updateTables();
            };

            /**
             * Gets the list of tables from the dataset service, sets the active table and fields, and queries for new data.
             * @method updateTables
             * @private
             */
            var updateTables = function() {
                $scope.tables = datasetService.getTables($scope.active.database.name);
                $scope.active.table = $scope.tables[0];
                if($scope.bindings.table) {
                    $scope.tables.forEach(function(table) {
                        if($scope.bindings.table === table.name) {
                            $scope.active.table = table;
                        }
                    });
                }

                updateFields();
            };

            /**
             * Gets the list of fields from the dataset service, sets the active fields, and queries for new data.
             * @method updateFields
             * @private
             */
            var updateFields = function() {
                // Stop extra data queries that may be caused by event handlers triggered by setting the active fields.
                $scope.initializing = true;

                if($scope.functions.isFilterSet()) {
                    removeAllFilters(true);
                }

                $scope.fields = datasetService.getSortedFields($scope.active.database.name, $scope.active.table.name);

                var filterFieldName = $scope.bindings.unsharedFilterField || "";
                $scope.active.unsharedFilterField = _.find($scope.fields, function(field) {
                    return field.columnName === filterFieldName;
                }) || datasetService.createBlankField();
                $scope.active.unsharedFilterValue = $scope.bindings.unsharedFilterValue || "";

                $scope.functions.onUpdateFields(datasetService);
                $scope.functions.onChangeField();

                if($scope.active.database && $scope.active.database.name && $scope.active.table && $scope.active.table.name) {
                    updateFilter();
                }

                queryAndUpdate();

                $scope.initializing = false;
            };

            /**
             * Handles the behavior for updating the fields for this visualization.
             * @param {Object} datasetService
             * @method onUpdateFields
             */
            $scope.functions.onUpdateFields = function() {
                // Do nothing.
            };

            /**
             * Handles the behavior for changing a data field in this visualization.
             * @method onChangeField
             */
            $scope.functions.onChangeField = function() {
                // Do nothing.
            };

            /**
             * Executes the query and updates the data for this visualization.
             * @method queryAndUpdate
             * @private
             */
            var queryAndUpdate = function() {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                // Save the title during the query so the title doesn't change immediately if the user changes the unshared filter.
                $scope.queryTitle = $scope.createTitle(true);

                // Resize the title and display after the error is hidden and the title is changed.
                resize();

                // Clear the display.
                $scope.functions.updateData([]);

                var connection = connectionService.getActiveConnection();

                if(!connection || !$scope.functions.hasValidDataFields(datasetService)) {
                    return;
                }

                var query = createQuery();

                XDATA.userALE.log({
                    activity: "alter",
                    action: "send",
                    elementId: $scope.type,
                    elementType: $scope.logElementType,
                    elementSub: $scope.type,
                    elementGroup: $scope.logElementGroup,
                    source: "system",
                    tags: ["query", $scope.type]
                });

                if($scope.outstandingDataQuery) {
                    $scope.outstandingDataQuery.abort();
                }

                $scope.outstandingDataQuery = $scope.functions.executeQuery(connection, query);
                $scope.outstandingDataQuery.done(function() {
                    $scope.outstandingDataQuery = undefined;
                });

                $scope.outstandingDataQuery.done(function(response) {
                    XDATA.userALE.log({
                        activity: "alter",
                        action: "receive",
                        elementId: $scope.type,
                        elementType: $scope.logElementType,
                        elementSub: $scope.type,
                        elementGroup: $scope.logElementGroup,
                        source: "system",
                        tags: ["receive", $scope.type]
                    });

                    $scope.$apply(function() {
                        // The response for an array-counts query is an array and the response for other queries is an object containing a data array.
                        $scope.functions.updateData(response.data || response);
                    });

                    XDATA.userALE.log({
                        activity: "alter",
                        action: "render",
                        elementId: $scope.type,
                        elementType: $scope.logElementType,
                        elementSub: $scope.type,
                        elementGroup: $scope.logElementGroup,
                        source: "system",
                        tags: ["render", $scope.type]
                    });
                });

                $scope.outstandingDataQuery.fail(function(response) {
                    if(response.status === 0) {
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "canceled",
                            elementId: $scope.type,
                            elementType: $scope.logElementType,
                            elementSub: $scope.type,
                            elementGroup: $scope.logElementGroup,
                            source: "system",
                            tags: ["canceled", $scope.type]
                        });
                    } else {
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "failed",
                            elementId: $scope.type,
                            elementType: $scope.logElementType,
                            elementSub: $scope.type,
                            elementGroup: $scope.logElementGroup,
                            source: "system",
                            tags: ["failed", $scope.type]
                        });

                        $scope.$apply(function() {
                            $scope.functions.updateData([]);
                        });

                        // See if the error response contains a Neon notification to show through the Error Notification Service.
                        if(response.responseJSON) {
                            $scope.errorMessage = errorNotificationService.showErrorMessage($scope.element, response.responseJSON.error, response.responseJSON.stackTrace);
                            // TODO Create an ERROR_CODES object in the Error Notification Service
                            $scope.functions.onError(response, {
                                TOO_MUCH_DATA_ERROR: errorNotificationService.TOO_MUCH_DATA_ERROR
                            });
                        }
                    }
                });
            };

            /**
             * Returns whether this visualization has valid data fields in order to execute a query.
             * @param {Object} datasetService
             * @method hasValidDataFields
             * @return {Boolean}
             */
            $scope.functions.hasValidDataFields = function() {
                return true;
            };

            /**
             * Executes the given query using the given connection and returns its result.
             * @param connection
             * @param query
             * @method executeQuery
             * @return {Object} outstandingDataQuery
             */
            $scope.functions.executeQuery = function(connection, query) {
                return connection.executeQuery(query);
            };

            /**
             * Updates the data and display for this visualization.  Clears the display if the data array is empty.
             * @param {Array} data
             * @method updateData
             */
            $scope.functions.updateData = function(data) {
                // Do nothing.
            };

            /**
             * Creates a query object for this visualization.
             * @return neon.query.Query
             * @method createQuery
             */
            var createQuery = function() {
                var query = new neon.query.Query().selectFrom($scope.active.database.name, $scope.active.table.name);
                var whereClause = $scope.functions.createNeonQueryClause();

                if(datasetService.isFieldValid($scope.active.unsharedFilterField) && $scope.active.unsharedFilterValue) {
                    var operator = "contains";
                    var value = $scope.active.unsharedFilterValue;
                    if($.isNumeric(value)) {
                        operator = "=";
                        value = parseFloat(value);
                    }
                    var unsharedFilterWhereClause = neon.query.where($scope.active.unsharedFilterField.columnName, operator, value);
                    whereClause = whereClause ? neon.query.and(whereClause, unsharedFilterWhereClause) : unsharedFilterWhereClause;
                }

                if(whereClause) {
                    query.where(whereClause);
                }

                return $scope.functions.addToQuery(query, filterService);
            }

            /**
             * Creates and returns the Neon where clause for the query for this visualization (or undefined).
             * @method createNeonQueryClause
             * @return {neon.query.Where}
             */
            $scope.functions.createNeonQueryClause = function() {
                return undefined;
            };

            /**
             * Adds to the given Neon query and returns the updated query for this visualization.
             * @param {neon.query.Query} query
             * @param {Object} filterService
             * @method addToQuery
             * @return {neon.query.Query}
             */
            $scope.functions.addToQuery = function(query) {
                return query;
            };

            /**
             * Handles the behavior for additional responses to query errors.
             * @param {Object} response The query response
             * @param {Object} errorCodes An object containing the error codes important to the Neon Dashboard
             * @method onError
             */
            $scope.functions.onError = function() {
                // Do nothing.
            };

            /**
             * Generates and returns the title for this visualization.
             * @param {Boolean} resetQueryTitle
             * @method createTitle
             * @return {String}
             */
            $scope.createTitle = function(resetQueryTitle) {
                if(resetQueryTitle) {
                    $scope.queryTitle = "";
                }
                if($scope.queryTitle) {
                    return $scope.queryTitle;
                }
                var title = $scope.active.unsharedFilterValue ? $scope.active.unsharedFilterValue + " " : "";
                if($scope.bindings.title) {
                    return title + $scope.bindings.title;
                }
                if(_.keys($scope.active).length) {
                    return title + $scope.active.table.prettyName;
                }
                return title;
            };

            /**
             * Event handler for theme changed events issued over Neon's messaging channels.
             * @param {Object} theme The new Neon Dashboard theme
             * @method handleThemeChangedEvent
             * @private
             */
            var handleThemeChangedEvent = function(theme) {
                if($scope.functions.onThemeChanged(theme)) {
                    XDATA.userALE.log({
                        activity: "alter",
                        action: "receive",
                        elementId: $scope.type,
                        elementType: $scope.logElementType,
                        elementSub: $scope.type,
                        elementGroup: $scope.logElementGroup,
                        source: "system",
                        tags: ["theme-changed", $scope.type]
                    });
                }
            };

            /**
             * Handles the behavior for changing the theme of elements in this visualization to the given theme.
             * @param {Object} theme
             * @method onThemeChanged
             * @return {Boolean} Whether them theme of any elements in this visualization needed to be changed
             */
            $scope.functions.onThemeChanged = function() {
                return false;
            };

            /**
             * Event handler for filters changed events issued over Neon's messaging channels.
             * @param {Object} message A Neon filters changed message
             * @method handleFiltersChangedEvent
             * @private
             */
            var handleFiltersChangedEvent = function(message) {
                if(message.addedFilter && message.addedFilter.databaseName === $scope.active.database.name && message.addedFilter.tableName === $scope.active.table.name) {
                    XDATA.userALE.log({
                        activity: "alter",
                        action: "query",
                        elementId: $scope.type,
                        elementType: $scope.logElementType,
                        elementSub: $scope.type,
                        elementGroup: $scope.logElementGroup,
                        source: "system",
                        tags: ["filters-changed", $scope.type]
                    });

                    updateFilter();
                    queryAndUpdate();
                }
            };

            /*
             * Updates the filter for this visualization by finding any matching filters set by other visualizations through the filter service.
             * @method updateFilter
             * @private
             */
            var updateFilter = function() {
                var filterFields = $scope.functions.getFilterableFields();
                var valid = true;
                filterFields.forEach(function(field) {
                    valid = valid && datasetService.isFieldValid(field);
                });

                if(valid) {
                    var filterFieldNames = filterFields.map(function(field) {
                        return field.columnName;
                    });
                    var neonFilter = filterService.getFilter($scope.active.database.name, $scope.active.table.name, filterFieldNames);
                    if(!neonFilter) {
                        $scope.filter.data = [];
                        $scope.functions.onRemoveFilter();
                    } else {
                        var data = [];
                        if(filterService.hasSingleClause(neonFilter)) {
                            var filterItem = {
                                field: neonFilter.filter.whereClause.lhs,
                                value: neonFilter.filter.whereClause.rhs
                            };
                            data.push($scope.functions.onAddFilter(filterItem, datasetService));
                        } else {
                            neonFilter.filter.whereClause.whereClauses.forEach(function(whereClause) {
                                var filterItem = {
                                    field: whereClause.lhs,
                                    value: whereClause.rhs
                                };
                                data.push($scope.functions.onAddFilter(filterItem, datasetService));
                            });
                        }
                        $scope.filter.database = neonFilter.filter.databaseName;
                        $scope.filter.table = neonFilter.filter.tableName;
                        $scope.filter.data = data;
                    }
                }
            };

            /**
             * Returns the list of field objects on which filters for this visualization are set.
             * @method getFilterableFields
             * @return {Array}
             */
            $scope.functions.getFilterableFields = function() {
                return [];
            };

            /**
             * Handles the behavior for adding a filter on the given filter data item to this visualization and returns the filter data item.
             * @param {Object} item The filter item containing {String} field and {String} value
             * @method onAddFilter
             * @return {Object} item
             */
            $scope.functions.onAddFilter = function(item) {
                return item;
            };

            /**
             * Handles the behavior for removing the filter on the given filter data item from this visualization (or removing all filters if no item is given).
             * @param {Object} item The filter item containing {String} field and {String} value (Optional)
             * @method onRemoveFilter
             */
            $scope.functions.onRemoveFilter = function() {
                // Do nothing.
            };

            /**
             * Replaces the global filter with a new filter containing the given fields and values and updates the dashboard.
             * Removes the global filter from the dashboard instead if it matches the given fields and values.
             * @param {Object} or {Array} fieldsAndValues An object or list of objects each containing a {String} field and {String} value for the filter
             * @method replaceOrRemoveFilter
             */
            $scope.functions.replaceOrRemoveFilter = function(fieldsAndValues) {
                replaceOrRemoveFilter(_.isArray(fieldsAndValues) ? fieldsAndValues : [fieldsAndValues]);
            };

            var replaceOrRemoveFilter = function(fieldsAndValues) {
                if($scope.functions.isFilterSet() && $scope.functions.matchesFilter(fieldsAndValues)) {
                    removeAllFilters(true);
                } else {
                    replaceFilter(fieldsAndValues);
                }
            };

            /**
             * Returns whether the the given fields and values match the fields and values set in the global filter data object.
             * The default implementation compares the "field" and "value" properties of the objects.
             * @param {Array} fieldsAndValues A list of objects each containing a {String} field and {String} value for the filter
             * @method matchesFilter
             * @return {Boolean}
             */
            $scope.functions.matchesFilter = function(fieldsAndValues) {
                if(fieldsAndValues.length === $scope.filter.data.length) {
                    var match = true;
                    fieldsAndValues.forEach(function(item) {
                        var index = _.findIndex($scope.filter.data, function(filterItem) {
                            return item.field === filterItem.field && item.value === filterItem.value;
                        });
                        if(index < 0) {
                            match = false;
                        }
                    });
                    return match;
                }
                return false;
            };

            /**
             * Replaces the global filter with a new filter containing the given fields and values and updates the dashboard.
             * @param {Object} or {Array} fieldsAndValues An object or list of objects each containing a {String} field and {String} value for the filter
             * @method addFilter
             */
            $scope.functions.replaceFilter = function(fieldsAndValues) {
                replaceFilter(_.isArray(fieldsAndValues) ? fieldsAndValues : [fieldsAndValues]);
            };

            var replaceFilter = function(fieldsAndValues) {
                $scope.filter.data = [];
                $scope.functions.onRemoveFilter();
                addFilter(fieldsAndValues);
            };

            /**
             * Adds the given fields and values to the global filter and updates the dashboard.
             * @param {Object} or {Array} fieldsAndValues An object or list of objects each containing a {String} field and {String} value for the filter
             * @method addFilter
             */
            $scope.functions.addFilter = function(fieldsAndValues) {
                addFilter(_.isArray(fieldsAndValues) ? fieldsAndValues : [fieldsAndValues]);
            };

            var addFilter = function(fieldsAndValues) {
                $scope.filter.database = $scope.active.database.name;
                $scope.filter.table = $scope.active.table.name;

                fieldsAndValues.forEach(function(item) {
                    if(item.field && item.value) {
                        $scope.filter.data.push($scope.functions.onAddFilter(item, datasetService));
                    }
                });

                if(!$scope.filter.data.length) {
                    return;
                }

                XDATA.userALE.log({
                    activity: "select",
                    action: "click",
                    elementId: $scope.type,
                    elementType: $scope.logElementType,
                    elementSub: $scope.type,
                    elementGroup: $scope.logElementGroup,
                    source: "user",
                    tags: ["filter", $scope.type]
                });

                // Will add or replace the filter as appropriate.
                filterService.addFilter($scope.messenger, $scope.filter.database, $scope.filter.table, getFilteredFields(), $scope.functions.createNeonFilterClause, {
                    visName: $scope.name,
                    text: $scope.functions.createFilterText()
                }, function() {
                    if($scope.functions.shouldQueryAfterFilter()) {
                        queryAndUpdate();
                    }
                });
            };

            /**
             * Returns the list of fields in the global filter data object.
             * @method getFilteredFields
             * @return {Array}
             */
            var getFilteredFields = function() {
                var fields = {};
                $scope.filter.data.forEach(function(filterItem) {
                    fields[filterItem.field] = true;
                });
                return Object.keys(fields);
            };

            /**
             * Creates and returns the Neon where clause for a Neon filter on the given database, table, and fields using the values set in this visualization.
             * @param {Object} databaseAndTableName Contains {String} database and {String} table
             * @param {String} fieldName or {Array} fieldNames The name (or list of names) of the filter fields
             * @method createNeonFilterClause
             * @return {neon.query.Where}
             */
            $scope.functions.createNeonFilterClause = function(databaseAndTableName, fieldName) {
                var filterClauses = $scope.filter.data.map(function(filterItem) {
                    return neon.query.where(fieldName, "=", filterItem.value);
                });
                if(filterClauses.length === 1) {
                    return filterClauses[0];
                }
                return neon.query.and.apply(neon.query, filterClauses);
            };

            /**
             * Returns the description text for the global filter data object.  The default implementation uses the "field" and "value" properties of the object.
             * @method createFilterText
             * @return {String}
             */
            $scope.functions.createFilterText = function() {
                var text = "";
                $scope.filter.data.forEach(function(filterItem) {
                    text += (text.length > 0 ? "," : "") + filterItem.field + " = " + filterItem.value;
                });
                return text;
            };

            /**
             * Returns whether this visualization should query for new data and updates its display after changing its filter.
             * @method shouldQueryAfterFilter
             * @return {Boolean}
             */
            $scope.functions.shouldQueryAfterFilter = function() {
                return false;
            };

            /**
             * Removes the given fields and values from the global filter and updates the dashboard.  Removes the global filter from the dashboard if no fields or values are given.
             * @param {Object} or {Array} fieldsAndValues An object or list of objects each containing a {String} field and {String} value for the filter (Optional)
             * @method removeFilter
             */
            $scope.functions.removeFilter = function(fieldsAndValues) {
                if(!fieldsAndValues || $scope.functions.matchesFilter(_.isArray(fieldsAndValues) ? fieldsAndValues : [fieldsAndValues])) {
                    removeAllFilters(false);
                } else {
                    removeFilter(false, _.isArray(fieldsAndValues) ? fieldsAndValues : [fieldsAndValues]);
                }
            };

            var removeAllFilters = function(fromSystem) {
                if(!$scope.functions.isFilterSet()) {
                    return;
                }

                filterService.removeFilter($scope.filter.database, $scope.filter.table, getFilteredFields(), function() {
                    $scope.filter.data = [];
                    $scope.functions.onRemoveFilter();

                    if(!fromSystem) {
                        XDATA.userALE.log({
                            activity: "deselect",
                            action: "click",
                            elementId: $scope.type,
                            elementType: "button",
                            elementSub: $scope.type,
                            elementGroup: $scope.logElementGroup,
                            source: "user",
                            tags: ["filter", $scope.type]
                        });
                    }

                    if($scope.functions.shouldQueryAfterFilter()) {
                        queryAndUpdate();
                    }
                });
            };

            var removeFilter = function(fromSystem, fieldsAndValues) {
                if(!$scope.functions.isFilterSet() || !fieldsAndValues) {
                    return;
                }

                fieldsAndValues.forEach(function(item) {
                    var index = _.findIndex($scope.filter.data, function(filterItem) {
                        return item.field === filterItem.field && item.value === filterItem.value;
                    });
                    if(index >= 0) {
                        var filterItem = $scope.filter.data.splice(index, 1);
                        $scope.functions.onRemoveFilter(filterItem);

                        if(!fromSystem) {
                            XDATA.userALE.log({
                                activity: "remove",
                                action: "click",
                                elementId: $scope.type,
                                elementType: "button",
                                elementSub: $scope.type,
                                elementGroup: $scope.logElementGroup,
                                source: "user",
                                tags: ["filter", $scope.type, filterItem.value]
                            });
                        }
                    }
                });

                // Will replace the filter.
                filterService.addFilter($scope.messenger, $scope.filter.database, $scope.filter.table, getFilteredFields(), $scope.functions.createNeonFilterClause, {
                    visName: $scope.name,
                    text: $scope.functions.createFilterText()
                }, function() {
                    if($scope.functions.shouldQueryAfterFilter()) {
                        queryAndUpdate();
                    }
                });
            };

            /**
             * Creates and returns an object that contains all the binding fields needed to recreate this visualization's state.
             * @return {Object}
             * @method getBindingFields
             * @private
             */
            var getBindingFields = function() {
                var bindingFields = {};

                // TODO Update to use the new binding system.
                bindingFields["bind-database"] = ($scope.active.database && $scope.active.database.name) ? "'" + $scope.active.database.name + "'" : undefined;
                bindingFields["bind-filter-field"] = datasetService.isFieldValid($scope.active.unsharedFilterField) ? "'" + $scope.active.unsharedFilterField.columnName + "'" : undefined;
                var hasFilterValue = datasetService.isFieldValid($scope.active.unsharedFilterField) && $scope.active.unsharedFilterValue;
                bindingFields["bind-filter-value"] = hasFilterValue ? "'" + $scope.active.unsharedFilterValue + "'" : undefined;
                bindingFields["bind-table"] = ($scope.active.table && $scope.active.table.name) ? "'" + $scope.active.table.name + "'" : undefined;
                bindingFields["bind-title"] = "'" + $scope.createTitle() + "'";

                return $scope.functions.addToBindings(bindingFields);
            };

            /**
             * Adds to the given list of bindings and returns the updated list for this visualization.
             * @param {Array} bindings
             * @method addToBindings
             * @return {Array}
             */
            $scope.functions.addToBindings = function(bindings) {
                return bindings;
            };

            /**
             * Logs the change for the given option, value, and element type.
             * @param {String} option
             * @param {String} value
             * @param {String} type (Optional) [Default:  combobox]
             * @method logChange
             * @private
             */
            var logChange = function(option, value, type) {
                XDATA.userALE.log({
                    activity: "select",
                    action: "click",
                    elementId: $scope.type + "Options",
                    elementType: type || "combobox",
                    elementSub: option,
                    elementGroup: $scope.logElementGroup,
                    source: "user",
                    tags: ["options", $scope.type, value]
                });
            };

            /**
             * Handles changing the database.
             * @method handleChangeDatabase
             */
            $scope.handleChangeDatabase = function() {
                logChange("database", $scope.active.database.name);
                updateTables();
            };

            /**
             * Handles changing the table.
             * @method handleChangeTable
             */
            $scope.handleChangeTable = function() {
                logChange("table", $scope.active.table.name);
                updateFields();
            };

            /**
             * Handles changing the unshared filter field.
             * @method handleChangeUnsharedFilterField
             */
            $scope.handleChangeUnsharedFilterField = function() {
                logChange("unsharedFilterField", $scope.active.unsharedFilterField.columnName);
                $scope.active.unsharedFilterValue = "";
            };

            /**
             * Handles changing the unshared filter value.
             * @method handleChangeUnsharedFilterValue
             */
            $scope.handleChangeUnsharedFilterValue = function() {
                logChange("unsharedFilterValue", $scope.active.unsharedFilterValue);
                if(!$scope.initializing) {
                    queryAndUpdate();
                }
            };

            /**
             * Handles removing the unshared filter.
             * @method handleRemoveUnsharedFilter
             */
            $scope.handleRemoveUnsharedFilter = function() {
                logChange("unsharedFilter", "", "button");
                $scope.active.unsharedFilterValue = "";
                if(!$scope.initializing) {
                    queryAndUpdate();
                }
            };

            /**
             * Utility function for logging a change of the given option to the given value using an element of the given type and executing a new query.
             * @param {String} option
             * @param {String} value
             * @param {String} type (Optional) [Default:  combobox]
             * @method handleChangeField
             */
            $scope.functions.handleChangeField = function(option, value, type) {
                handleChangeField(option, value, type);
            };

            var handleChangeField = function(option, value, type) {
                logChange(option, value, type);
                if(!$scope.initializing) {
                    $scope.functions.onChangeField();
                    queryAndUpdate();
                }
            };

            /**
             * Updates the 'from' language on translation and translates if 'Show Translation' is checked
             * @param {String} language The 'from' translation language to change to
             * @method handleChangeFromLanguage
             */
            $scope.handleChangeFromLanguage = function(language) {
                logChange("sourceLanguage", language);
                $scope.languages.chosenFromLanguage = language;

                if($scope.active.showTranslations) {
                    performTranslation();
                }
            };

            /**
             * Updates the 'to' language on translation and translates if 'Show Translation' is checked
             * @param {String} language The 'to' translation language to change to
             * @method handleChangeToLanguage
             */
            $scope.handleChangeToLanguage = function(language) {
                logChange("targetLanguage", language);
                $scope.languages.chosenToLanguage = language;

                if($scope.active.showTranslations) {
                    performTranslation();
                }
            };

            /**
             * Translates all text back to its original form if checked is false, or to the specified 'to' language if checked is true.
             * @param {Boolean} checked Whether 'Show Translation' is checked or unchecked
             * @param {String} fromLang The 'from' language to use for translation
             * @param {String} toLang The 'to' language to use for translation
             * @method handleToggleTranslation
             */
            $scope.handleToggleTranslations = function(checked, fromLang, toLang) {
                logChange("showTranslations", checked);
                $scope.active.showTranslations = checked;

                if(checked) {
                    $scope.languages.chosenFromLanguage = fromLang;
                    $scope.languages.chosenToLanguage = toLang;
                    performTranslation();
                } else {
                    clearTranslation();
                }
            };

            /**
             * Translates data for this visualization using the global to/from languages.
             * @method performTranslation
             */
            $scope.functions.performTranslation = function() {
                performTranslation();
            };

            var performTranslation = function() {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                translationService.translate($scope.functions.getTranslationData(), $scope.languages.chosenToLanguage,
                    translationSuccessCallback, translationFailureCallback, $scope.languages.chosenFromLanguage);
            };

            /**
             * Returns the data on which to perform the translation for this visualization.
             * @method getTranslationData
             * @return {Array} data
             */
            $scope.functions.getTranslationData = function() {
                return [];
            };

            /**
             * Translation success callback for the given translation response that saves the translation cache.
             * @param {Object} response Response object containing all the translations.
             * @param {Array} response.data.data.translations List of all translations. It's assumed that
             * all translations are given in the order the original text to translate was received in.
             * @param {String} response.data.data.translations[].translatedText
             * @param {String} [response.data.data.translations[].detectedSourceLanguage] Detected language
             * code of the original version of translatedText. Only provided if the source language was auto-detected.
             * @method translationSuccessCallback
             * @private
             */
            var translationSuccessCallback = function(response) {
                translationService.saveTranslationCache();
                $scope.functions.onTranslationSuccess(response);
            };

            /**
             * Handles translation success for the given response.
             * @param {Object} response Response object containing all the translations.
             * @param {Array} response.data.data.translations List of all translations. It's assumed that
             * all translations are given in the order the original text to translate was received in.
             * @param {String} response.data.data.translations[].translatedText
             * @param {String} [response.data.data.translations[].detectedSourceLanguage] Detected language
             * code of the original version of translatedText. Only provided if the source language was auto-detected.
             * @method onTranslationSuccess
             */
            $scope.functions.onTranslationSuccess = function() {
                // Do nothing.
            };

            /**
             * Translation failure callback for the given translation response that displays an error message.
             * @param {Object} response An error response containing the message and reason.
             * @param {String} response.message
             * @param {String} response.reason
             * @method translationFailureCallback
             * @private
             */
            var translationFailureCallback = function(response) {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }
                $scope.errorMessage = errorNotificationService.showErrorMessage($scope.element, response.message,  response.reason);
                $scope.functions.onTranslationFailure(response);
            };

            /**
             * Handles translation failure for the given response.
             * @param {Object} response An error response containing the message and reason.
             * @param {String} response.message
             * @param {String} response.reason
             * @method onTranslationFailure
             */
            $scope.functions.onTranslationFailure = function() {
                // Do nothing.
            };

            /**
             * Clears all translations and the global to/from languages.
             * @method clearTranslation
             * @private
             */
            var clearTranslation = function() {
                $scope.functions.onClearTranslation();
                $scope.languages.chosenFromLanguage = "";
                $scope.languages.chosenToLanguage = "";
            };

            /**
             * Handles the behavior for clearing all translations.
             * @method onClearTranslation
             */
            $scope.functions.onClearTranslation = function() {
                // Do nothing.
            };

            /**
             * Creates and returns the links for the given field object and item object.
             * @param {Object} field Containing {String} columnName
             * @param {Object} item Containing a property matching the field name
             * @method createLinks
             * @return {Object} links
             */
            $scope.functions.createLinks = function(field, item) {
                return createLinks(field, item);
            };

            var createLinks = function(field, item) {
                var mappings = datasetService.getMappings($scope.active.database.name, $scope.active.table.name);
                var value = item[field.columnName];
                var links = linksPopupService.createAllServiceLinkObjects(external.services, mappings, field.columnName, value);
                var key = linksPopupService.generateKey(field, value);
                linksPopupService.addLinks($scope.visualizationId, linksPopupService.generateKey(field, value), links);
                return links;
            };

            /**
             * Creates and returns the link buttons for the given field object and data array.
             * @param {Object} field Containing {String} columnName
             * @param {Array} data A list of objects each containing a property matching the field name
             * @method createLinkButtons
             * @return {Array} buttons
             */
            $scope.functions.createLinkButtons = function(field, data) {
                return createLinkButtons(field, data);
            };

            var createLinkButtons = function(field, data) {
                var links = {};
                var buttons = [];

                data.forEach(function(item) {
                    var value = item[field.columnName];
                    var key = linksPopupService.generateKey(field, value);
                    links[key] = linksPopupService.createAllServiceLinkObjects(external.services, mappings, field.columnName, value);
                    buttons.push(links[key].length ? linksPopupService.createLinkHtml($scope.visualizationId, key, value) :
                        linksPopupService.createDisabledLinkHtml(value));
                });

                linksPopupService.setLinks($scope.visualizationId, links);

                return buttons;
            };

            /**
             * Removes the links for the given field object and value, or all links for this visualization if no field or value are given.
             * @param {Object} field (Optional)
             * @param {String} value (Optional)
             * @method removeLinks
             */
            $scope.functions.removeLinks = function(field, value) {
                removeLinks(field, value);
            };

            var removeLinks = function(field, value) {
                if(datasetService.isFieldValid(field) && value) {
                    linksPopupService.removeLinksForKey($scope.visualizationId, linksPopupService.generateKey(field, value));
                } else {
                    linksPopupService.deleteLinks($scope.visualizationId);
                }
            };

            /**
             * Returns the links popup service object.
             * @method getLinksPopupService
             * @return {Object}
             */
            $scope.functions.getLinksPopupService = function() {
                return linksPopupService;
            };

            /**
             * Called by the options-menu directive.  Wrapper for createMenuText.
             * @method optionsMenuButtonText
             * @return {String}
             */
            $scope.optionsMenuButtonText = function() {
                return $scope.functions.createMenuText();
            };

            /**
             * Creates and returns the text for the options menu button.
             * @method createMenuText
             * @return {String}
             */
            $scope.functions.createMenuText = function() {
                return "";
            };

            /**
             * Called by the options-menu directive.  Wrapper for showMenuText.
             * @method showOptionsMenuButtonText
             * @return {Boolean}
             */
            $scope.showOptionsMenuButtonText = function() {
                return $scope.functions.showMenuText();
            };

            /**
             * Returns whether to show the text for the options menu button.
             * @method showMenuText
             * @return {Boolean}
             */
            $scope.functions.showMenuText = function() {
                return false;
            };

            /**
             * Returns whether to hide the filter header for this visualization.  The default implementation hides the filter header if a filter is not set.
             * @method hideFilterHeader
             * @return {Boolean}
             */
            $scope.functions.hideFilterHeader = function() {
                return !$scope.functions.isFilterSet();
            };

            /**
             * Called by the options-menu directive.  Wrapper for createExportObject.
             * @method makeExportObject
             * @return {Object}
             */
            $scope.makeExportObject = function() {
                XDATA.userALE.log({
                    activity: "perform",
                    action: "click",
                    elementId: $scope.type,
                    elementType: "button",
                    elementSub: "export",
                    elementGroup: $scope.logElementGroup,
                    source: "user",
                    tags: ["options", $scope.type, "export"]
                });

                var query = createQuery();
                query.limitClause = exportService.getLimitClause();
                return $scope.functions.createExportDataObject(query);
            };

            /**
             * Creates and returns an object containing the data needed to export this visualization.
             * @param {neon.query.Query} query
             * @method createExportDataObject
             * @return {Object}
             */
            $scope.functions.createExportDataObject = function() {
                return {};
            };

            /**
             * Initializes this visualization.
             * @method init
             */
            $scope.functions.init = function() {
                neon.ready(function() {
                    $scope.init();
                });
            };
        }]
    };
}]);
