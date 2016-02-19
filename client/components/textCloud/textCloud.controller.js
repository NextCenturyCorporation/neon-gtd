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

angular.module('neonDemo.controllers').controller('textCloudController', ['$scope', '$timeout', function($scope, $timeout) {
    $scope.active.dataField = {};
    $scope.active.andFilters = true;
    $scope.active.limit = 40;
    $scope.active.textColor = "#111";
    $scope.active.data = [];
    $scope.active.filters = [];

    $scope.functions.allowTranslation = function() {
        return true;
    };

    $scope.functions.onInit = function() {
        updateTagcloudPluginSettings();
    };

    /**
     * Updates the settings for the tagcloud plugin to use the global text color.
     * @method updateTagcloudPluginSettings
     * @private
     */
    var updateTagcloudPluginSettings = function() {
        $.fn.tagcloud.defaults = {
            size: {
                start: 130,
                end: 250,
                unit: '%'
            },
            color: {
                start: '#aaaaaa',
                end: $scope.active.textColor
            }
        };
    };

    $scope.functions.onUpdateFields = function(datasetService) {
        var dataFieldName = $scope.bindings.dataField || datasetService.getMapping($scope.active.database.name, $scope.active.table.name, neonMappings.TAGS) || "";
        $scope.active.dataField = _.find($scope.fields, function(field) {
            return field.columnName === dataFieldName;
        }) || datasetService.createBlankField();
    };

    $scope.functions.hasValidDataFields = function(datasetService) {
        return datasetService.isFieldValid($scope.active.dataField);
    }

    $scope.functions.executeQuery = function(connection, query) {
        // Note that the where clause must be null, not undefined.
        return connection.executeArrayCountQuery($scope.active.database.name, $scope.active.table.name, $scope.active.dataField.columnName, $scope.active.limit,
                query.filter.whereClause || null);
    };

    $scope.functions.updateData = function(data) {
        if($scope.functions.isFilterSet() && $scope.active.andFilters) {
            data = data.filter(function(item) {
                var index = _.findIndex($scope.active.filters, {
                    value: item.key
                });
                return index === -1;
            });
        }

        $scope.active.data = data.map(function(item) {
            item.keyTranslated = item.key;
            return item;
        });

        if($scope.active.showTranslations) {
            $scope.functions.performTranslation();
        }

        updateTextStyle();
    };

    /**
     * Updates the style of the text in this visualization using the tagcloud plugin.
     * @method updateTextStyle
     * @private
     */
    var updateTextStyle = function() {
        $timeout(function() {
            var text = $scope.element.find('.text');
            $scope.element.find('.text').tagcloud();
        });
    };

    $scope.functions.shouldQueryAfterFilter = function() {
        return true;
    };

    $scope.functions.isFilterSet = function() {
        return $scope.active.filters.length;
    };

    $scope.functions.getFilterFields = function() {
        return [$scope.active.dataField];
    };

    $scope.functions.createNeonFilterClause = function(databaseAndTableName, fieldName) {
        var filterClauses = $scope.active.filters.map(function(filter) {
            return neon.query.where(fieldName, "=", filter.value);
        });
        if(filterClauses.length === 1) {
            return filterClauses[0];
        }
        if($scope.active.andFilters) {
            return neon.query.and.apply(neon.query, filterClauses);
        }
        return neon.query.or.apply(neon.query, filterClauses);
    };

    $scope.functions.createFilterTrayText = function() {
        return (_.pluck($scope.active.filters, ($scope.active.showTranslations ? "translated" : "value"))).join(", ");
    };

    $scope.functions.updateFilterFromNeonFilterClause = function(filterService, neonFilter) {
        $scope.active.filters = [];
        if(filterService.hasSingleClause(neonFilter)) {
            onAddFilter(neonFilter.filter.whereClause.rhs);
        } else {
            neonFilter.filter.whereClause.whereClauses.forEach(function(whereClause) {
                onAddFilter(whereClause.rhs);
            });
        }
    };

    var onAddFilter = function(value, translated) {
        $scope.active.filters.push({
            translated: translated || value,
            value: value
        });
        var links = $scope.functions.createLinks($scope.active.dataField, value);
        $scope.showLinksPopupButton = !!links.length;
    };

    $scope.functions.onRemoveFilter = function() {
        $scope.active.filters = [];
        $scope.functions.removeLinks($scope.active.dataField);
    };

    /**
     * Adds a filter on the given value.
     * @param {String} value
     * @param {String} translated
     * @method addFilter
     */
    $scope.addFilter = function(value, translated) {
        var index = _.findIndex($scope.active.filters, {
            value: value
        });

        if(index < 0) {
            onAddFilter(value, translated);
            $scope.functions.addFilter();
        }
    };

    /**
     * Removes the filter on the given value.
     * @param {String} value
     * @method removeFilter
     */
    $scope.removeFilter = function(value) {
        var index = _.findIndex($scope.active.filters, {
            value: value
        });

        if(index >= 0) {
            $scope.active.filters.splice(index, 1);
            $scope.functions.removeLinks($scope.active.dataField, value);

            XDATA.userALE.log({
                activity: "remove",
                action: "click",
                elementId: "textCloud",
                elementType: "button",
                elementSub: "textCloud",
                elementGroup: "chart_group",
                source: "user",
                tags: ["filter", "textCloud", value]
            });
        }

        if($scope.active.filters.length) {
            $scope.functions.replaceFilter();
        } else {
            $scope.functions.removeFilter();
        }
    };

    $scope.handleChangeDataField = function() {
        $scope.functions.handleChangeField("dataField", $scope.active.dataField.columnName);
    };

    $scope.handleChangeAndFilters = function() {
        $scope.functions.handleChangeField("andFilters", $scope.active.andFilters, "button");
        $scope.functions.replaceFilter();
    };

    $scope.functions.updateTranslations = function() {
        var dataKeys = $scope.active.data.map(function(item) {
            return item.key;
        });

        if($scope.functions.isFilterSet()) {
            $scope.active.filters.forEach(function(filter) {
                dataKeys.push(filter.value);
            });
        }

        $scope.functions.runTranslation(data, onTranslationSuccess);
    };

    var onTranslationSuccess = function(translations) {
        translations.forEach(function(item, index) {
            if(index < $scope.active.data.length) {
                $scope.active.data[index].keyTranslated = item.translatedText;
            } else {
                $scope.active.filters[index - $scope.active.data.length].translated = item.translatedText;
            }
        });
    };

    $scope.functions.removeTranslations = function() {
        $scope.active.data = $scope.active.data.map(function(item) {
            item.keyTranslated = item.key;
            return item;
        });

        if($scope.functions.isFilterSet()) {
            $scope.active.filters = _.map($scope.active.filters, function(filter) {
                filter.translated = filter.value;
                return filter;
            });
        }
    };

    $scope.functions.createExportDataObject = function(exportId, query) {
        var finalObject = {
            name: "Text_Cloud",
            data: [{
                database: $scope.active.database.name,
                table: $scope.active.table.name,
                field: $scope.active.dataField.columnName,
                limit: $scope.active.limit,
                name: "textCloud-" + exportId,
                fields: [],
                type: "arraycount"
            }]
        };
        finalObject.data[0].fields.push({
            query: "key",
            pretty: "Key"
        });
        finalObject.data[0].fields.push({
            query: "count",
            pretty: "Count"
        });
        return finalObject;
    };

    $scope.functions.addToBindings = function(bindings) {
        // TODO Update to use the new binding system.
        bindings["bind-data-field"] = ($scope.active.dataField && $scope.active.dataField.columnName) ? "'" + $scope.active.dataField.columnName + "'" : undefined;
        return bindings;
    };

    /**
     * Generates and returns the links popup key for this visualization.
     * @method generateLinksPopupKey
     * @return {String}
     */
    $scope.generateLinksPopupKey = function(value) {
        return $scope.functions.getLinksPopupService().generateKey($scope.active.dataField, value);
    };

    $scope.functions.onThemeChanged = function(theme) {
        if(theme.accentColor !== $scope.active.textColor) {
            $scope.active.textColor = theme.accentColor;
            updateTagcloudPluginSettings();
            updateTextStyle();
            return true;
        }
        return false;
    };

    $scope.functions.createMenuText = function() {
        return !$scope.functions.isFilterSet() && !$scope.active.data.length ? "No Data" : "";
    };

    $scope.functions.showMenuText = function() {
        return !$scope.functions.isFilterSet() && !$scope.active.data.length;
    };

    $scope.getFilterData = function() {
        return $scope.active.filters.map(function(filter) {
            return filter.value;
        });
    };

    $scope.createFilterDesc = function(value) {
        return $scope.active.dataField.columnName + " = " + value;
    };

    $scope.createFilterText = function(value) {
        if(!$scope.active.showTranslations) {
            return value;
        }

        var text = "";
        $scope.active.filters.forEach(function(filter) {
            if(filter.value === value) {
                text = filter.translated || filter.value;
            }
        });
        return text;
    };
}]);
