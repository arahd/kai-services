class CustomHtmlParser:
    def __init__(self):
        self.table_filter_criteria = {'table', 'tbody', 'thead', 'tfoot', 'tr', 'td', 'th'}
        self.text_element_filter_criteria = {'h1','h2','h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol','span','strong'}

    def is_inside_element_identifier(self,element,filter_criteria):
        table_tags = filter_criteria
        parent = element.parent
        while parent:
            if parent.name in table_tags:
                return True
            parent = parent.parent
        return False
