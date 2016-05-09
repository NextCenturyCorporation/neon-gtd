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

describe('Controller: dataTable', function() {
    // load the necessary modules
    beforeEach(module('neonDemo'));
    beforeEach(module('neonTemplates'));

    var $compile;
    var $rootScope;
    var widgetContainer;
    var mockConfig;
    var scope;

    beforeEach(function() {
        mockConfig = {};
        module(function($provide) {
            $provide.value('config', mockConfig);
        });
    });

    beforeEach(inject(function(_$compile_, _$rootScope_, _DatasetService_) {
        $compile = _$compile_;
        $rootScope = _$rootScope_;
        $rootScope.bindings = {};

        var DatasetService = _DatasetService_;
        var thedataset = {
            name: 'thedataset',
            databases: [{
                name: 'thedatabase',
                tables: [{
                    name: 'thetable',
                    fields: [{
                        name: 'thefield',
                        columnName: 'thefield',
                        prettyName: 'thefield'
                    }]
                }]
            }]
        };
        DatasetService.addDataset(thedataset);
        DatasetService.setActiveDataset(thedataset);
        DatasetService.setMapping('thedatabase', 'thetable', 'sortField', 'thefield');

        widgetContainer = $compile('<div class="visualization-well visualization-widget"><div visualization-superclass implementation="singleLayer" name="Data Table" type="dataTable" visualization-id="unique-id" bindings="bindings"></div></div>')($rootScope);
        $rootScope.$digest();

        scope = widgetContainer.find('.results-table').scope();
        scope.initData();
        scope.functions.onChangeOption();
    }));

    it('initializes', function() {
        expect(widgetContainer.find('.results-table').length).toBe(1);
        expect(widgetContainer.find('.ag-body').length).toBe(1);
        expect(widgetContainer.find('.results-table').scope()).not.toBeUndefined();
    });

    it('shows a column', function() {
        scope.functions.updateData([
            {
                thefield: 'foo'
            },
            {
                thefield: 'bar'
            }
        ]);
        expect(widgetContainer.find('.ag-body').text()).toContain('foo');
        expect(widgetContainer.find('.ag-body').text()).toContain('bar');
    });

    it('shows a column', function() {
        scope.functions.updateData([
            {
                thefield: '<b>bold</b>'
            },
            {
                thefield: 'foo & bar'
            }
        ]);
        expect(widgetContainer.find('.ag-body').html()).toContain('&lt;b&gt;bold&lt;/b&gt;');
        expect(widgetContainer.find('.ag-body').html()).toContain('foo &amp; bar');
    });
});
