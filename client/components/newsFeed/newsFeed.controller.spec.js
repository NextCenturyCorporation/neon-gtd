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

describe('Controller: newsFeed', function() {
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
        var titleField = {
            name: 'thetitlefield',
            columnName: 'thetitlefield',
            prettyName: 'thetitlefield'
        };
        var secondaryField = {
            name: 'thesecondaryfield',
            columnName: 'thesecondaryfield',
            prettyName: 'thesecondaryfield'
        };
        var contentField = {
            name: 'thecontentfield',
            columnName: 'thecontentfield',
            prettyName: 'thecontentfield'
        };
        var dateField = {
            name: 'thedatefield',
            columnName: 'thedatefield',
            prettyName: 'thedatefield'
        };
        var thedataset = {
            name: 'thedataset',
            databases: [{
                name: 'thedatabase',
                tables: [{
                    name: 'thetable',
                    fields: [
                        titleField,
                        secondaryField,
                        contentField,
                        dateField
                    ]
                }]
            }]
        };
        DatasetService.addDataset(thedataset);
        DatasetService.setActiveDataset(thedataset);

        widgetContainer = $compile('<div class="visualization-well visualization-widget"><div visualization-superclass implementation="singleLayer" name="News Feed" type="newsFeed" visualization-id="unique-id" bindings="bindings"></div></div>')($rootScope);
        $rootScope.$digest();

        scope = widgetContainer.find('.newsfeed').scope();
        scope.active.database = thedataset.databases[0];
        scope.active.table = thedataset.databases[0].tables[0];
        scope.active.primaryTitleField = titleField;
        scope.active.secondaryTitleField = secondaryField;
        scope.active.contentField = contentField;
        scope.active.dateField = dateField;
        scope.functions.onChangeOption();
    }));

    it('initializes', function() {
        expect(widgetContainer.find('.newsfeed').length).toBe(1);
        expect(widgetContainer.find('.newsfeed').scope()).not.toBeUndefined();
    });

    it('show an item', function() {
        var data = [{
            thetitlefield: 'foo',
            thesecondaryfield: 'bar',
            thecontentfield: 'stuff',
            thedatefield: '2005-04-05T09:30:00Z'
        }];
        scope.$apply(function() {
            scope.functions.updateData(data);
        });
        expect(widgetContainer.find('.newsfeed').text()).toContain('foo');
        expect(widgetContainer.find('.newsfeed').text()).toContain('bar');
        expect(widgetContainer.find('.newsfeed').text()).toContain('stuff');
    });

    it('escapes HTML', function() {
        var data = [{
            thetitlefield: '<b>bold</b>',
            thesecondaryfield: 'this & that',
            thecontentfield: '5 < 4',
            thedatefield: '2005-04-05T09:30:00Z'
        }];
        scope.$apply(function() {
            scope.functions.updateData(data);
        });
        expect(widgetContainer.find('.newsfeed').html()).toContain('&lt;b&gt;bold&lt;/b&gt;');
        expect(widgetContainer.find('.newsfeed').html()).toContain('this &amp; that');
        expect(widgetContainer.find('.newsfeed').html()).toContain('5 &lt; 4');
    });
});
