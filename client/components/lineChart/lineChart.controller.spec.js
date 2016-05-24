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

describe('Controller: lineChart', function() {
    // load the necessary modules
    beforeEach(module('neonDemo'));
    beforeEach(module('neonTemplates'));

    var $compile;
    var $rootScope;
    var widgetContainer;
    var mockConfig;

    beforeEach(function() {
        mockConfig = {};
        module(function($provide) {
            $provide.value('config', mockConfig);
        });
    });

    beforeEach(inject(function(_$compile_, _$rootScope_) {
        $compile = _$compile_;
        $rootScope = _$rootScope_;
        $rootScope.bindings = {};

        widgetContainer = $compile('<div class="visualization-well visualization-widget"><div visualization-superclass implementation="multipleLayer" name="Line Chart" type="lineChart" visualization-id="unique-id" bindings="bindings"></div></div>')($rootScope);
        $rootScope.$digest();
    }));

    it('initializes', function() {
        expect(widgetContainer.find('.lineChartDirective').length).toBe(1);
        expect(widgetContainer.find('.lineChartDirective').scope()).not.toBeUndefined();
        expect(widgetContainer.find('div.legend-details').length).toBe(1);
    });

    describe('legend', function() {
        var scope;
        var layerId = 'foo';

        beforeEach(inject(function(_DatasetService_) {
            var DatasetService = _DatasetService_;
            DatasetService.setActiveDataset({
                name: 'thedataset'
            });

            scope = widgetContainer.find('.lineChartDirective').scope();
            scope.active.layers.push({
                name: 'FOO',
                id: layerId,
                aggregationType: 'count',
                dateField: {
                    columnName: 'date',
                    prettyName: 'date'
                },
                aggregationField: 'value',
                groupField: {
                    columnName: 'cat',
                    prettyName: 'cat'
                },
                database: {
                    name: 'thedatabase'
                },
                table: {
                    name: 'thetable'
                }
            });
        }));

        it('creates labels', function() {
            var layers = [{
                id: layerId
            }];
            var data = [
                {
                    date: "2014-04-01T00:01:00Z",
                    month: 4,
                    day: 1,
                    year: 2014,
                    cat: "Category One",
                    value: 9
                },
                {
                    date: "2014-04-01T00:01:00Z",
                    month: 4,
                    day: 1,
                    year: 2014,
                    cat: "Category Two",
                    value: 42
                }
            ];
            scope.$apply(function() {
                scope.functions.updateData(data, layers);
                scope.functions.onDoneQueryAndUpdate(data, layers);
            });

            // The legend should include the label text
            expect(widgetContainer.find('.legend-details').text()).toContain(data[0].cat);
            expect(widgetContainer.find('.legend-details').text()).toContain(data[1].cat);
        });

        it('escapes HTML in labels', function() {
            var layers = [{
                id: layerId
            }];
            var data = [
                {
                    date: "2014-04-01T00:01:00Z",
                    month: 4,
                    day: 1,
                    year: 2014,
                    cat: "<b>BOLD</b>",
                    value: 9
                },
                {
                    date: "2014-04-01T00:01:00Z",
                    month: 4,
                    day: 1,
                    year: 2014,
                    cat: "This & That",
                    value: 42
                }
            ];
            scope.$apply(function() {
                scope.functions.updateData(data, layers);
                scope.functions.onDoneQueryAndUpdate(data, layers);
            });

            // Check html() because text() will unescape the characters
            expect(widgetContainer.find('.legend-details').html()).toContain(_.escape(data[0].cat));
            expect(widgetContainer.find('.legend-details').html()).toContain(_.escape(data[1].cat));
        });
    });
});
