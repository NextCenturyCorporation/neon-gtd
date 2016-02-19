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

            $scope.functions = {};

            $scope.languages = {
                fromLanguageOptions: {},
                toLanguageOptions: {},
                chosenFromLanguage: "",
                chosenToLanguage: ""
            };

            var DEFAULT_LINKY_CONFIG = {
                hashtags: false,
                mentions: false,
                urls: true,
                linkTo: ""
            };

            /**
             * Returns the jQuery element in this visualization matching the given string, or the element for this visualization itself if no string is given.
             * @param {String} element
             * @method getElement
             * @return {Object}
             */
            $scope.functions.getElement = function(element) {
                return element ? $scope.element.find(element) : $scope.element;
            };

            /**
             * Subscribes the messenger for this visualization to events with the given type using the given listener.
             * @param {String} type
             * @param {Function} listener
             * @method subscribe
             */
            $scope.functions.subscribe = function(type, listener) {
                $scope.messenger.subscribe(type, listener);
            };

            /**
             * Publishes an event with the given type and data using the messenger for this visualization.
             * @param {String} type
             * @param {Object} data
             * @method publish
             */
            $scope.functions.publish = function(type, data) {
                $scope.messenger.publish(type, data);
            };

            /**
             * Initializes this visualization.
             * @method init
             */
            $scope.init = function() {
                $scope.messenger = new neon.eventing.Messenger();
                $scope.messenger.subscribe(datasetService.UPDATE_DATA_CHANNEL, doQueryAndUpdate);
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
                        removeFilter(true);
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
                // Set the width of the title to the width of this visualization minus the width of the options button/text and margin/padding.
                var titleWidth = $scope.element.width() - $scope.element.find(".chart-options").outerWidth(true) - 20;
                $scope.element.find(".title").css("maxWidth", titleWidth);
            };

            /**
             * Resizes the display of this visualization.
             * @method resizeDisplay
             * @private
             */
            var resizeDisplay = function() {
                var headersHeight = 0;
                $scope.element.find(".header-container").each(function() {
                    headersHeight += $(this).outerHeight(true);
                });
                $("#" + $scope.visualizationId).height($scope.element.height() - headersHeight);
                $scope.functions.onResize($scope.element.height(), $scope.element.width(), headersHeight);
            };

            /**
             * Returns whether a filter is set in this visualization.
             * @method isFilterSet
             * @return {Boolean}
             */
            $scope.functions.isFilterSet = function() {
                return false;
            };

            /**
             * Handles any additional behavior for destroying this visualization.
             * @method onDestroy
             */
            $scope.functions.onDestroy = function() {
                // Do nothing by default.
            };

            /**
             * Handles any additional behavior for initializing this visualization.
             * @method onInit
             */
            $scope.functions.onInit = function() {
                // Do nothing by default.
            };

            /**
             * Handles any additional behavior for resizing this visualization.
             * @param {Number} elementHeight
             * @param {Number} elementWidth
             * @param {Number} headersHeight
             * @method onResize
             */
            $scope.functions.onResize = function() {
                // Do nothing by default.
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
                    removeFilter(true);
                }

                // Sort the fields that are displayed in the dropdowns in the options menus alphabetically.
                $scope.fields = datasetService.getSortedFields($scope.active.database.name, $scope.active.table.name);

                var filterFieldName = $scope.bindings.unsharedFilterField || "";
                $scope.active.unsharedFilterField = _.find($scope.fields, function(field) {
                    return field.columnName === filterFieldName;
                }) || datasetService.createBlankField();
                $scope.active.unsharedFilterValue = $scope.bindings.unsharedFilterValue || "";

                $scope.functions.onUpdateFields(datasetService);
                $scope.functions.onChangeDataOption();

                if($scope.active.database && $scope.active.database.name && $scope.active.table && $scope.active.table.name) {
                    updateFilter();
                }

                doQueryAndUpdate();

                $scope.initializing = false;
            };

            /**
             * Handles any additional behavior for updating the fields for this visualization.
             * @param {Object} datasetService
             * @method onUpdateFields
             */
            $scope.functions.onUpdateFields = function() {
                // Do nothing by default.
            };

            /**
             * Handles any additional behavior for changing a data field in this visualization.
             * @method onChangeDataOption
             */
            $scope.functions.onChangeDataOption = function() {
                // Do nothing by default.
            };

            /**
             * Builds and executes the default data query and updates the data for this visualization.
             * @method doQueryAndUpdate
             * @private
             */
            var doQueryAndUpdate = function() {
                queryAndUpdate($scope.functions.addToQuery, $scope.functions.executeQuery, $scope.functions.updateData);
            };

            /**
             * Builds and returns the Neon query object for this visualization.
             * @method buildQuery
             * @return {neon.query.Query}
             * @private
             */
            var buildQuery = function(callback) {
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

                return callback ? callback(query, filterService) : $scope.functions.addToQuery(query, filterService);
            };

            /**
             * Creates and returns the Neon where clause for queries for this visualization (or undefined).
             * @method createNeonQueryClause
             * @return {neon.query.WhereClause}
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
             * Executes the given query using the given connection.
             * @param {Object} connection
             * @param {neon.query.Query} query
             * @method executeQuery
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
                // Do nothing by default.
            };

            /**
             * Builds and executes a query and updates the data for this visualization using the given build, execute, and update data callbacks.
             * @param {Function} buildQueryCallback
             * @param {Function} executeQueryCallback
             * @param {Function} updateDataCallback
             * @method queryAndUpdate
             */
            $scope.functions.queryAndUpdate = function(buildQueryCallback, executeQueryCallback, updateDataCallback) {
                queryAndUpdate(buildQueryCallback, executeQueryCallback, updateDataCallback);
            };

            var queryAndUpdate = function(buildQueryCallback, executeQueryCallback, updateDataCallback) {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                // Save the title during the query so the title doesn't change immediately if the user changes the unshared filter.
                $scope.queryTitle = $scope.createTitle(true);

                // Resize the title and display after the error is hidden and the title is changed.
                resize();

                var updateDataFunction = updateDataCallback || $scope.functions.updateData;

                // Clear the display.
                updateDataFunction([]);

                var connection = connectionService.getActiveConnection();

                if(!connection || !$scope.functions.hasValidDataFields(datasetService)) {
                    return;
                }

                var query = buildQuery(buildQueryCallback);

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

                $scope.outstandingDataQuery = executeQueryCallback ? executeQueryCallback(connection, query) : $scope.functions.executeQuery(connection, query);
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
                        updateDataFunction(response.data || response);
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
                            updateDataFunction([]);
                        });

                        // See if the error response contains a Neon notification to show through the Error Notification Service.
                        if(response.responseJSON) {
                            $scope.errorMessage = errorNotificationService.showErrorMessage($scope.element, response.responseJSON.error, response.responseJSON.stackTrace);
                        }

                        // TODO Create an ERROR_CODES object in the Error Notification Service
                        $scope.functions.onError(response, {
                            TOO_MUCH_DATA_ERROR: errorNotificationService.TOO_MUCH_DATA_ERROR
                        });
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
             * Handles any additional behavior for responding to a query error.
             * @param {Object} response The query response
             * @param {Object} errorCodes An object containing the error codes important to the Neon Dashboard
             * @method onError
             */
            $scope.functions.onError = function() {
                // Do nothing by default.
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
             * Handles any behavior for changing the theme of elements in this visualization to the given theme.
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
                    doQueryAndUpdate();
                }
            };

            /*
             * Updates the filter for this visualization by finding any matching filters set by other visualizations through the filter service.
             * @method updateFilter
             * @private
             */
            var updateFilter = function() {
                var filterFields = $scope.functions.getFilterFields();
                var valid = true;
                filterFields.forEach(function(field) {
                    valid = valid && datasetService.isFieldValid(field);
                });

                if(valid) {
                    var filterFieldNames = filterFields.map(function(field) {
                        return field.columnName;
                    });
                    var neonFilter = filterService.getFilter($scope.active.database.name, $scope.active.table.name, filterFieldNames);
                    if(!neonFilter && $scope.functions.isFilterSet()) {
                        $scope.functions.onRemoveFilter();
                    }
                    if(neonFilter) {
                        $scope.functions.updateFilterFromNeonFilterClause(filterService, neonFilter);
                    }
                }
            };

            /**
             * Returns the list of field objects on which filters for this visualization are set.
             * @method getFilterFields
             * @return {Array}
             */
            $scope.functions.getFilterFields = function() {
                return [];
            };

            /**
             * Handles any behavior after removing the filter from this visualization.
             * @method onRemoveFilter
             */
            $scope.functions.onRemoveFilter = function() {
                // Do nothing by default.
            };

            /**
             * Updates the filter for this visualization using the where clause in the given Neon filter.
             * @param {Object} filterService
             * @param {neon.query.Filter} neonFilter
             * @method updateFilterFromNeonFilterClause
             */
            $scope.functions.updateFilterFromNeonFilterClause = function() {
                // Do nothing by default.
            };

            /**
             * Replaces the global filter with a new filter containing the given fields and values and updates the dashboard.
             * @param {Boolean} queryAndUpdate (Optional)
             * @method replaceFilter
             */
            $scope.functions.replaceFilter = function(queryAndUpdate) {
                replaceFilter(queryAndUpdate);
            };

            var replaceFilter = function(queryAndUpdate) {
                addFilter(queryAndUpdate);
            };

            /**
             * Adds the given fields and values to the global filter and updates the dashboard.
             * @param {Boolean} queryAndUpdate (Optional)
             * @method addFilter
             */
            $scope.functions.addFilter = function(queryAndUpdate) {
                addFilter(queryAndUpdate);
            };

            var addFilter = function(queryAndUpdate) {
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
                filterService.addFilter($scope.messenger, $scope.active.database.name, $scope.active.table.name, getFilterFieldNames(), $scope.functions.createNeonFilterClause, {
                    visName: $scope.name,
                    text: $scope.functions.createFilterTrayText()
                }, function() {
                    if($scope.functions.shouldQueryAfterFilter() || queryAndUpdate) {
                        doQueryAndUpdate();
                    }
                });
            };

            /**
             * Returns the list of field names on which filters for this visualization are set.
             * @method getFilterFieldNames
             * @return {Array}
             */
            var getFilterFieldNames = function() {
                return $scope.functions.getFilterFields().map(function(field) {
                    return field.columnName;
                });
            };

            /**
             * Creates and returns the Neon where clause for a Neon filter on the given database, table, and fields using the filters set in this visualization.
             * @param {Object} databaseAndTableName Contains {String} database and {String} table
             * @param {String} fieldName or {Array} fieldNames The name (or list of names) of the filter fields
             * @method createNeonFilterClause
             * @return {neon.query.WhereClause}
             */
            $scope.functions.createNeonFilterClause = function(databaseAndTableName, fieldName) {
                return neon.query.where(fieldName, "!=", null);
            };

            /**
             * Returns the description text for the global filter data object to show in the filter tray.
             * @method createFilterTrayText
             * @return {String}
             */
            $scope.functions.createFilterTrayText = function() {
                return "";
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
             * Removes the filter for this visualization and updates the dashboard.
             * @method removeFilter
             */
            $scope.functions.removeFilter = function() {
                removeFilter(false);
            };

            var removeFilter = function(fromSystem) {
                filterService.removeFilter($scope.active.database.name, $scope.active.table.name, getFilterFieldNames(), function() {
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
                        doQueryAndUpdate();
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
                    doQueryAndUpdate();
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
                    doQueryAndUpdate();
                }
            };

            /**
             * Utility function for logging a change of the given option to the given value using an element of the given type, running a new query and updating the data.
             * @param {String} option
             * @param {String} value
             * @param {String} type (Optional) [Default:  combobox]
             * @method logChangeAndUpdateData
             */
            $scope.functions.logChangeAndUpdateData = function(option, value, type) {
                logChangeAndUpdateData(option, value, type);
            };

            var logChangeAndUpdateData = function(option, value, type) {
                logChange(option, value, type);
                if(!$scope.initializing) {
                    $scope.functions.onChangeDataOption();
                    doQueryAndUpdate();
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
                    $scope.functions.updateTranslations();
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
                    $scope.functions.updateTranslations();
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
                    $scope.functions.updateTranslations();
                } else {
                    $scope.functions.removeTranslations();
                }
            };

            /**
             * Updates all translations in this visualization.
             * @method updateTranslations
             */
            $scope.functions.updateTranslations = function() {
                // Do nothing by default.
            };

            /**
             * Translates the given data for this visualization using the global to/from languages and the given success/failure callbacks.
             * @param {Array} data
             * @param {Function} translationSuccessCallback (Optional)
             * @param {Function} translationFailureCallback (Optional)
             * @method runTranslation
             */
            $scope.functions.runTranslation = function(data, translationSuccessCallback, translationFailureCallback) {
                runTranslation(data, translationSuccessCallback, translationFailureCallback);
            };

            var runTranslation = function(data, translationSuccessCallback, translationFailureCallback) {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                translationService.translate(data, $scope.languages.chosenToLanguage, function(response) {
                    translationService.saveTranslationCache();
                    if(translationSuccessCallback) {
                        translationSuccessCallback(response.data.data.translations);
                    }
                }, function(response) {
                    if($scope.errorMessage) {
                        errorNotificationService.hideErrorMessage($scope.errorMessage);
                        $scope.errorMessage = undefined;
                    }
                    $scope.errorMessage = errorNotificationService.showErrorMessage($scope.element, response.message,  response.reason);
                    if(translationFailureCallback) {
                        translationFailureCallback(response.data.data.translations);
                    }
                }, $scope.languages.chosenFromLanguage);
            };

            /**
             * Removes all translations from this visualization.
             * @method removeTranslations
             */
            $scope.functions.removeTranslations = function() {
                // Do nothing by default.
            };

            /**
             * Creates and returns the links for the given field object and item object.
             * @param {Object} field Containing {String} columnName
             * @param {String} value
             * @method createLinks
             * @return {Object} links
             */
            $scope.functions.createLinks = function(field, value) {
                return createLinks(field, value);
            };

            var createLinks = function(field, value) {
                var mappings = datasetService.getMappings($scope.active.database.name, $scope.active.table.name);
                var links = linksPopupService.createAllServiceLinkObjects(external.services, mappings, field.columnName, value);
                var key = linksPopupService.generateKey(field, value);
                linksPopupService.addLinks($scope.visualizationId, linksPopupService.generateKey(field, value), links);
                return links;
            };

            /**
             * Creates and returns the links for the given external service type, link key, and link data.
             * @param {String} type
             * @param {String} key
             * @param {Object} data
             * @method createLinksForData
             * @return {Object} links
             */
            $scope.functions.createLinksForData = function(type, key, data) {
                return createLinksForData(type, key, data);
            };

            var createLinksForData = function(type, key, data) {
                var links = [];
                Object.keys(external.services[type].apps).forEach(function(app) {
                    links.push(linksPopupService.createServiceLinkObjectWithData(external.services[type], app, data));
                });
                linksPopupService.addLinks($scope.visualizationId, key, links);
                return links;
            };

            /**
             * Creates and returns the link buttons for the given field object and data array.
             * @param {Object} field Containing {String} columnName
             * @param {Array} array A list of objects each containing a property matching the field name
             * @method createLinkButtons
             * @return {Array} buttons
             */
            $scope.functions.createLinkButtons = function(field, array) {
                return createLinkButtons(field, array);
            };

            var createLinkButtons = function(field, array) {
                var links = {};
                var buttons = [];

                array.forEach(function(element) {
                    var value = element[field.columnName];
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
             * Returns the configuration for the linky library.
             * @method getLinkyConfig
             * @return {Object}
             */
            $scope.functions.getLinkyConfig = function() {
                return datasetService.getLinkyConfig() || DEFAULT_LINKY_CONFIG;
            };

            /**
             * Returns whether the given field object is valid.
             * @param {Object} field
             * @method isFieldValid
             * @return {Boolean}
             */
            $scope.functions.isFieldValid = function(field) {
                return datasetService.isFieldValid(field);
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
             * Returns whether to hide the headers in the filter header container for this visualization.  The default implementation hides the headers if a filter is not set.
             * @method hideHeaders
             * @return {Boolean}
             */
            $scope.functions.hideHeaders = function() {
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

                var query = buildQuery();
                query.limitClause = exportService.getLimitClause();
                return $scope.functions.createExportDataObject($scope.exportId, query, exportService);
            };

            /**
             * Creates and returns an object containing the data needed to export this visualization.
             * @param {String} exportId
             * @param {neon.query.Query} query
             * @param {Object} exportService
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
